import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';
const code = (await build({ entryPoints: ['src/components/graph/fixedSimulationClock.ts'], bundle: true, write: false, format: 'iife', globalName: 'Clock' })).outputFiles[0].text;

test('fallback physics uses 60Hz deadlines, stops cleanly, and can restart after settling', () => {
  let now = 0, id = 0, ticks = 0, heat = 1, ended = 0, onTick = () => {};
  const timers = new Map();
  const context = vm.createContext({ performance: { now: () => now }, setTimeout: (fn, delay) => { timers.set(++id, { fn, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id) });
  vm.runInContext(code, context);
  const sim = context.Clock.withFixedSimulationClock({ stop() { return this; }, tick() { ticks++; now += 4; }, alpha: () => heat, alphaMin: () => 0.001, on: name => name === 'tick' ? () => onTick() : () => { ended++; } });
  const advanceTo = end => { for (let i = 0; i < 1000; i++) { const entry = [...timers].sort((a,b) => a[1].at - b[1].at)[0]; if (!entry || entry[1].at > end) break; timers.delete(entry[0]); now = Math.max(now, entry[1].at); entry[1].fn(); } now = Math.max(now, end); };
  sim.restart();
  // Many render opportunities do not change the physics rate.
  for (let i = 0; i < 144; i++) advanceTo((i + 1) * 1000 / 144);
  assert.ok(ticks >= 58 && ticks <= 62, `ticks=${ticks}`);
  sim.stop(); const stopped = ticks; advanceTo(now + 1000); assert.equal(ticks, stopped);
  heat = 0; sim.restart(); advanceTo(now + 100); assert.equal(ended, 1); assert.equal(timers.size, 0);
  heat = 1; onTick = () => sim.stop(); sim.restart(); advanceTo(now + 100); assert.equal(timers.size, 0);
});
