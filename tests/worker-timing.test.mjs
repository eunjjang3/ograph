import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/components/graph/graphSimulation.worker.ts'],
  bundle: true, write: false, platform: 'browser', format: 'iife'
});

function workerHarness({ paused = false, alphaDecay = 0.001, workMs = 10, profile = {},
  nodes = [{ id: 'a', x: 0, y: 0, vx: 0, vy: 0, degree: 1 }, { id: 'b', x: 50, y: 20, vx: 0, vy: 0, degree: 1 }],
  links = [{ source: 'a', target: 'b' }]
} = {}) {
  let now = 0, id = 0;
  const timers = new Map(), messages = [];
  const context = vm.createContext({
    console,
    performance: { now: () => now },
    setTimeout: (fn, delay = 0) => {
      const token = ++id;
      timers.set(token, { fn, at: now + Math.max(1, delay) });
      return token;
    },
    clearTimeout: token => timers.delete(token),
    setInterval: () => ++id,
    clearInterval: () => {},
    postMessage: message => {
      messages.push({ ...message, at: now });
      // Account for computation/publication inside each tick. A scheduler
      // that adds a fresh 17ms after work will fall to roughly 37 updates/s.
      if (message.type === 'tick') now += workMs;
    }
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const send = data => context.onmessage({ data: { revision: 1, ...data } });
  send({
    type: 'initialize', protocolVersion: 2,
    nodes, links,
    config: { forceScale: 1, chargeDistanceMin: 1, sizeBasedCollision: true, centerFirst: false, linkStrength: 1, degreeNormalizedLinks: true, collisionStrength: 0.5, coolCollision: true, chargeStrength: -50, linkDistance: 45, nodeRadius: 4.5, collisionRadius: 8, gravityStrength: 0.1, velocityDecay: 0.4, alphaDecay, alphaMin: 0.001, graphRefreshAlpha: 0.22, preserveScopeCentroid: false, gravityCenterNodeIds: null, paused, ...profile }
  });
  const advance = ms => {
    const end = now + ms;
    for (let steps = 0; steps < 10000; steps++) {
      const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > end) break;
      timers.delete(entry[0]);
      now = Math.max(now, entry[1].at);
      entry[1].fn();
    }
    now = Math.max(now, end);
  };
  return { send, advance, messages, ticks: () => messages.filter(m => m.type === 'tick') };
}

test('Worker counts force work inside its 60Hz budget', () => {
  const worker = workerHarness();
  worker.advance(1000);
  assert.ok(worker.ticks().length >= 58 && worker.ticks().length <= 62, `received ${worker.ticks().length} updates`);
  assert.equal(worker.messages.some(m => m.type === 'error'), false);
});

test('Worker pauses, acknowledges drag release while paused, resumes, and disposes without orphan ticks', () => {
  const worker = workerHarness({ paused: true });
  worker.advance(500);
  assert.equal(worker.ticks().length, 1);
  worker.send({ type: 'drag-start', nodeId: 'a', alphaTarget: 0.3 });
  worker.send({ type: 'drag-move', nodeId: 'a', x: 0, y: -20, alphaTarget: 0.3, wakeConnectedNodes: false, dragSequence: 1 });
  assert.equal(worker.ticks().at(-1).dragSequence, 1);
  assert.deepEqual([...new Float32Array(worker.ticks().at(-1).positions)].slice(0, 2), [0, -20]);
  worker.send({ type: 'drag-end', nodeId: 'a', dragSequence: 2 });
  assert.equal(worker.ticks().at(-1).dragSequence, 2);
  const pausedTicks = worker.ticks().length;
  worker.send({ type: 'restart', alpha: 1 });
  worker.advance(500);
  assert.equal(worker.ticks().length, pausedTicks);
  worker.send({ type: 'set-paused', paused: false });
  worker.advance(200);
  assert.ok(worker.ticks().length > pausedTicks);
  worker.send({ type: 'set-paused', paused: true });
  const stoppedTicks = worker.ticks().length;
  worker.advance(200);
  assert.equal(worker.ticks().length, stoppedTicks);
  worker.send({ type: 'set-paused', paused: false });
  worker.send({ type: 'dispose' });
  worker.advance(500);
  assert.equal(worker.ticks().length, stoppedTicks);
});

test('Worker settling stops the clock; resume stays idle and explicit restart wakes it', () => {
  const worker = workerHarness({ alphaDecay: 0.5 });
  worker.advance(500);
  assert.equal(worker.messages.filter(m => m.type === 'settled').length, 1);
  const count = worker.ticks().length;
  worker.send({ type: 'set-paused', paused: true });
  worker.send({ type: 'set-paused', paused: false });
  worker.advance(500);
  assert.equal(worker.ticks().length, count);
  worker.send({ type: 'restart', alpha: 0.5 });
  worker.advance(200);
  assert.ok(worker.ticks().length > count);
});


test('a dense graph sheds residual collision motion before cooling stops its Worker', () => {
  const nodes = Array.from({ length: 96 }, (_, i) => ({ id: String(i), x: (i % 12) * 8, y: Math.floor(i / 12) * 8, vx: 0, vy: 0, degree: i < 2 ? 48 : 3 }));
  const links = nodes.slice(2).flatMap((n, i) => [{ source: n.id, target: String(i % 2) }, { source: n.id, target: String((i + 3) % nodes.length) }]);
  function lastMovement(profile) {
    const worker = workerHarness({ nodes, links, profile, alphaDecay: 1 - Math.pow(0.001, 1 / 300), workMs: 0 });
    worker.advance(6000);
    worker.send({ type: 'drag-start', nodeId: '0', alphaTarget: 0.3 });
    worker.send({ type: 'drag-move', nodeId: '0', x: 200, y: 100, alphaTarget: 0.3, wakeConnectedNodes: false, dragSequence: 1 });
    worker.advance(600);
    worker.send({ type: 'drag-end', nodeId: '0', dragSequence: 2 });
    worker.advance(6000);
    const ticks = worker.ticks(), a = new Float32Array(ticks.at(-2).positions), b = new Float32Array(ticks.at(-1).positions);
    assert.equal(worker.messages.some(m => m.type === 'error'), false);
    assert.equal(worker.messages.at(-1).type, 'settled');
    return Math.sqrt(b.reduce((sum, value, i) => sum + (value - a[i]) ** 2, 0) / nodes.length);
  }
  const smooth = lastMovement({});
  const legacy = lastMovement({ linkStrength: 0.85, degreeNormalizedLinks: false, collisionStrength: 0.9, coolCollision: false });
  assert.ok(smooth < legacy * 0.2, `terminal displacement: smooth=${smooth}, legacy=${legacy}`);
  assert.ok(smooth < 0.02, `smooth terminal movement ${smooth} world units`);
});
