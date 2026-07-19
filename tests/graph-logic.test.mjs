import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const repoRoot = new URL('../', import.meta.url);
const moduleCache = new Map();

function viteWorkerImportStubPlugin() {
  return {
    name: 'vite-worker-import-stub',
    setup(build) {
      build.onResolve({ filter: /\?worker$/ }, args => ({
        path: args.path,
        namespace: 'ograph-worker-test'
      }));
      build.onLoad({ filter: /.*/, namespace: 'ograph-worker-test' }, () => ({
        contents: 'export default class TestWorker {}',
        loader: 'js'
      }));
    }
  };
}

async function importSourceModule(relativePath) {
  const sourcePath = fileURLToPath(new URL(relativePath, repoRoot));
  const cached = moduleCache.get(sourcePath);
  if (cached) return cached;

  const result = await esbuild.build({
    entryPoints: [sourcePath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [viteWorkerImportStubPlugin()]
  });
  const code = result.outputFiles[0].text;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  const loaded = await import(moduleUrl);
  moduleCache.set(sourcePath, loaded);
  return loaded;
}

async function importHookModuleWithReactStub(relativePath) {
  const sourcePath = fileURLToPath(new URL(relativePath, repoRoot));
  const result = await esbuild.build({
    entryPoints: [sourcePath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [viteWorkerImportStubPlugin(), {
      name: 'react-hook-stub',
      setup(build) {
        build.onResolve({ filter: /^react$/ }, () => ({
          path: 'react-hook-stub',
          namespace: 'ograph-test'
        }));
        build.onLoad({ filter: /.*/, namespace: 'ograph-test' }, () => ({
          contents: [
            'export const useEffect = () => undefined;',
            'export const useMemo = factory => factory();',
            'export const useState = initial => [typeof initial === "function" ? initial() : initial, () => undefined];'
          ].join('\n'),
          loader: 'js'
        }));
      }
    }]
  });
  const code = result.outputFiles[0].text;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return import(moduleUrl);
}

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function choose(random, values) {
  return values[Math.floor(random() * values.length)];
}

function maybeAddNodeNumber(random, node, key) {
  if (random() > 0.65) return;

  node[key] = choose(random, [
    Math.round((random() - 0.5) * 1000) / 10,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    null,
    'invalid'
  ]);
}

function maybeAddNodeSize(random, node) {
  if (random() > 0.6) return;

  node.size = choose(random, [
    Math.round(random() * 40) / 10,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    null,
    'huge'
  ]);
}

function createRandomNodeId(random, index) {
  const roll = random();

  if (roll < 0.5) return `n${Math.floor(random() * 8)}`;
  if (roll < 0.68) return `unique-${index}`;
  if (roll < 0.76) return '';
  if (roll < 0.84) return 42;
  if (roll < 0.92) return null;
  return ` spaced ${Math.floor(random() * 3)} `;
}

function createRandomLabel(random, id) {
  return choose(random, [
    undefined,
    null,
    99,
    { text: 'bad label' },
    `Label ${String(id)}`
  ]);
}

function createRandomNode(random, index) {
  const roll = random();

  if (roll < 0.06) return null;
  if (roll < 0.12) return `not-node-${index}`;

  const id = createRandomNodeId(random, index);
  const node = {
    id,
    label: createRandomLabel(random, id),
    metadata: { seedIndex: index, bucket: Math.floor(random() * 4) }
  };

  for (const key of ['x', 'y', 'vx', 'vy', 'fx', 'fy']) {
    maybeAddNodeNumber(random, node, key);
  }
  maybeAddNodeSize(random, node);

  return node;
}

function getInputStringIds(nodes) {
  return nodes
    .filter(node => node && typeof node === 'object' && typeof node.id === 'string')
    .map(node => node.id);
}

function createRandomEndpoint(random, stringIds) {
  const candidates = stringIds.length > 0 ? stringIds : ['missing-fallback'];
  const id = choose(random, [...candidates, 'missing-a', 'missing-b', '']);
  const roll = random();

  if (roll < 0.48) return id;
  if (roll < 0.76) return { id, label: `Endpoint ${id}` };
  if (roll < 0.86) return { id: 123 };
  if (roll < 0.94) return null;
  return 123;
}

function createRandomLink(random, stringIds, index) {
  const roll = random();

  if (roll < 0.06) return null;
  if (roll < 0.1) return `not-link-${index}`;

  return {
    source: createRandomEndpoint(random, stringIds),
    target: createRandomEndpoint(random, stringIds),
    label: choose(random, [undefined, null, 100, `Link ${index}`]),
    metadata: { seedIndex: index }
  };
}

function createRandomGraphInput(seed) {
  const random = createSeededRandom(seed);
  const nodeCount = Math.floor(random() * 18);
  const nodes = Array.from({ length: nodeCount }, (_, index) => createRandomNode(random, index));
  const stringIds = getInputStringIds(nodes);
  const linkCount = Math.floor(random() * 42);
  const links = Array.from({ length: linkCount }, (_, index) => createRandomLink(random, stringIds, index));

  return {
    nodes,
    links,
    localDepth: choose(random, [undefined, null, Number.NaN, -10, 0, 1, 2.8, '4', 999, 'bad'])
  };
}

function getEndpointId(endpoint) {
  if (typeof endpoint === 'string') return endpoint;
  if (endpoint && typeof endpoint === 'object' && typeof endpoint.id === 'string') return endpoint.id;
  return null;
}

function assertEmptyPatch(patch, message) {
  assert.deepEqual(patch, {
    addedNodes: [],
    removedNodeIds: [],
    updatedNodes: [],
    addedLinks: [],
    removedLinks: [],
    updatedLinks: []
  }, message);
}

function structurallyEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

test('filterLocalGraph handles global, missing-root, and depth-limited local graphs', async () => {
  const { filterLocalGraph } = await importSourceModule('src/components/graph/localGraph.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
    { id: 'd', label: 'D' }
  ];
  const links = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'd' }
  ];

  assert.deepEqual(filterLocalGraph(nodes, links, null, 1), { nodes, links });
  assert.deepEqual(filterLocalGraph(nodes, links, 'missing', 1), { nodes: [], links: [] });

  const depthOne = filterLocalGraph(nodes, links, 'a', 1);
  assert.deepEqual(depthOne.nodes.map(node => node.id), ['a', 'b']);
  assert.deepEqual(depthOne.links.map(link => `${link.source}-${link.target}`), ['a-b']);

  const depthTwo = filterLocalGraph(nodes, links, 'a', 2);
  assert.deepEqual(depthTwo.nodes.map(node => node.id), ['a', 'b', 'c']);
  assert.deepEqual(depthTwo.links.map(link => `${link.source}-${link.target}`), ['a-b', 'b-c']);
});

test('debug frame telemetry summarizes percentiles and long-frame budgets', async () => {
  const { summarizeFrameIntervals } = await importSourceModule(
    'src/components/graph/debug/useFpsCounter.ts'
  );
  const telemetry = summarizeFrameIntervals([
    16,
    16.5,
    17,
    20,
    40,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1
  ]);

  assert.deepEqual(telemetry, {
    frameIntervalP50Ms: 17,
    frameIntervalP95Ms: 40,
    longFramesOver16Ms: 3,
    longFramesOver33Ms: 1,
    sampleSize: 5
  });
});

test('debug frame telemetry keeps FPS and percentiles on the same timestamp window', async () => {
  const {
    createFrameTelemetryWindow,
    recordFrameTimestamp
  } = await importSourceModule('src/components/graph/debug/useFpsCounter.ts');
  const steadyWindow = createFrameTelemetryWindow();
  let steadyTelemetry = recordFrameTimestamp(steadyWindow, 0);

  for (let index = 1; index <= 60; index += 1) {
    steadyTelemetry = recordFrameTimestamp(steadyWindow, index * 16.7) ?? steadyTelemetry;
  }

  assert.equal(steadyTelemetry.fps, 60);
  assert.equal(steadyTelemetry.frameIntervalP95Ms, 16.7);
  assert.equal(steadyTelemetry.sampleSize, 60);

  const resumedWindow = createFrameTelemetryWindow();
  recordFrameTimestamp(resumedWindow, 0);
  recordFrameTimestamp(resumedWindow, 16.7);
  recordFrameTimestamp(resumedWindow, 33.4);
  const resumedTelemetry = recordFrameTimestamp(resumedWindow, 2033.4);

  assert.deepEqual(resumedTelemetry, {
    fps: 1,
    frameIntervalP50Ms: 2000,
    frameIntervalP95Ms: 2000,
    longFramesOver16Ms: 1,
    longFramesOver33Ms: 1,
    sampleSize: 1
  });
});

test('private graph runtime telemetry starts in a deterministic empty state', async () => {
  const { createGraphRuntimeTelemetry } = await importSourceModule(
    'src/components/graph/graphRuntime.ts'
  );

  const telemetry = createGraphRuntimeTelemetry('pixi', 'worker');
  assert.equal(Number.isFinite(telemetry.runtimeStartedAt), true);
  assert.deepEqual({ ...telemetry, runtimeStartedAt: 0 }, {
    renderer: 'pixi',
    simulation: 'worker',
    renderCount: 0,
    lastRenderDurationMs: 0,
    lastRenderAt: 0,
    lastFrameCpuDurationMs: 0,
    lastPreRendererDurationMs: 0,
    lastSpatialIndexDurationMs: 0,
    lastLabelVisibilityDurationMs: 0,
    activeRenderFps: 0,
    activeRenderIntervalP95Ms: 0,
    activeRenderDurationP50Ms: 0,
    activeRenderDurationP95Ms: 0,
    activeRenderDurationMaxMs: 0,
    activeRenderSampleSize: 0,
    activeRenderWindowMs: 0,
    activeRenderSequence: 0,
    lastRendererProfile: null,
    simulationUpdateCount: 0,
    lastSimulationUpdateAt: 0,
    materializedNodes: 0,
    materializedLinks: 0,
    materializedLabels: 0,
    topologySyncDurationMs: 0,
    firstVisibleFrameLatencyMs: 0,
    runtimeStartedAt: 0,
    workerResultAgeMs: 0,
    visibleNodes: 0,
    visibleLinks: 0,
    visibleLabels: 0,
    simulationActive: false,
    activeFrameReasons: 'initializing'
  });
});

test('active graph render telemetry excludes idle gaps and summarizes draw CPU', async () => {
  const {
    createActiveGraphRenderWindow,
    createGraphRuntimeTelemetry,
    recordActiveGraphRenderSample
  } = await importSourceModule('src/components/graph/graphRuntime.ts');
  const telemetry = createGraphRuntimeTelemetry('pixi', 'worker');
  const window = createActiveGraphRenderWindow();
  let published = false;

  for (let index = 0; index <= 60; index += 1) {
    published = recordActiveGraphRenderSample(
      window,
      telemetry,
      index * 16.7,
      index === 60 ? 20 : 5,
      true
    ) || published;
  }

  assert.equal(published, true);
  assert.equal(telemetry.activeRenderFps, 59.9);
  assert.equal(telemetry.activeRenderIntervalP95Ms, 16.7);
  assert.equal(telemetry.activeRenderDurationP50Ms, 5);
  assert.equal(telemetry.activeRenderDurationP95Ms, 5);
  assert.equal(telemetry.activeRenderDurationMaxMs, 20);
  assert.equal(telemetry.activeRenderSampleSize, 60);
  assert.equal(telemetry.activeRenderSequence, 1);

  recordActiveGraphRenderSample(window, telemetry, 5000, 5, false);
  assert.equal(recordActiveGraphRenderSample(window, telemetry, 6000, 5, true), false);
  assert.equal(recordActiveGraphRenderSample(window, telemetry, 6016.7, 5, true), false);
  assert.equal(telemetry.activeRenderSequence, 1);
});

test('worker simulation protocol validates and unpacks transferable positions', async () => {
  const {
    GRAPH_SIMULATION_PROTOCOL_VERSION,
    isGraphSimulationWorkerResponse,
    unpackWorkerPositions
  } = await importSourceModule('src/components/graph/graphSimulationProtocol.ts');
  const positions = new Float32Array([1, 2, 3, 4]);

  assert.equal(isGraphSimulationWorkerResponse({
    type: 'ready',
    protocolVersion: GRAPH_SIMULATION_PROTOCOL_VERSION,
    revision: 3,
    nodeCount: 2
  }), true);
  assert.equal(isGraphSimulationWorkerResponse({
    type: 'tick',
    revision: 3,
    alpha: 0.5,
    positions: positions.buffer
  }), true);
  assert.deepEqual([...unpackWorkerPositions(positions.buffer, 2)], [1, 2, 3, 4]);
  assert.equal(unpackWorkerPositions(new ArrayBuffer(4), 2), null);
  assert.equal(isGraphSimulationWorkerResponse({ type: 'tick', revision: 3 }), false);
});

test('worker simulation client covers lifecycle, pause, restart, drag, and buffer recycle', async () => {
  const { createWorkerGraphSimulationClient } = await importSourceModule(
    'src/components/graph/workerGraphSimulationClient.ts'
  );
  const { GRAPH_SIMULATION_PROTOCOL_VERSION } = await importSourceModule(
    'src/components/graph/graphSimulationProtocol.ts'
  );

  class FakeWorker {
    onmessage = null;
    onerror = null;
    onmessageerror = null;
    messages = [];
    terminated = false;

    postMessage(message, transfer = []) {
      this.messages.push({ message, transfer });
    }

    terminate() {
      this.terminated = true;
    }

    emit(data) {
      this.onmessage?.({ data });
    }
  }

  const worker = new FakeWorker();
  const snapshots = [];
  const activeStates = [];
  let tickCount = 0;
  const client = createWorkerGraphSimulationClient({
    createWorker: () => worker,
    revision: 7,
    nodes: [
      { id: 'a', label: 'A', x: 0, y: 0 },
      { id: 'b', label: 'B', x: 10, y: 10 }
    ],
    links: [{ source: 'a', target: 'b' }],
    cachedPositions: new Map(),
    config: {
      chargeStrength: -50,
      linkDistance: 45,
      nodeRadius: 4.5,
      collisionRadius: 5,
      gravityStrength: 0.1,
      velocityDecay: 0.4,
      alphaDecay: 0.02,
      alphaMin: 0.001,
      graphRefreshAlpha: 0.22,
      preserveScopeCentroid: false,
      gravityCenterNodeIds: null,
      paused: false
    },
    onGraphReady: snapshot => snapshots.push(snapshot),
    onActiveChange: active => activeStates.push(active),
    onTick: () => { tickCount += 1; },
    onReady: () => {},
    onError: error => { throw error; }
  });

  client.start();
  assert.equal(worker.messages[0].message.type, 'initialize');
  assert.equal(worker.messages[0].message.protocolVersion, GRAPH_SIMULATION_PROTOCOL_VERSION);
  assert.equal(snapshots[0].nodes.length, 2);

  worker.emit({
    type: 'ready',
    protocolVersion: GRAPH_SIMULATION_PROTOCOL_VERSION,
    revision: 7,
    nodeCount: 2
  });
  const positions = new Float32Array([5, 6, 7, 8]);
  worker.emit({ type: 'tick', revision: 7, alpha: 0.5, positions: positions.buffer });
  assert.deepEqual(snapshots[0].nodes.map(node => [node.x, node.y]), [[5, 6], [7, 8]]);
  assert.equal(tickCount, 1);
  assert.equal(worker.messages.at(-1).message.type, 'recycle');
  assert.equal(worker.messages.at(-1).transfer.length, 1);

  client.setPaused(true);
  client.setPaused(false);
  client.restart(0.75);
  client.dragStart('a', 0.4);
  client.dragMove('a', 11, 12, 0.3, true);
  client.dragEnd('a');
  assert.deepEqual(worker.messages.slice(-6).map(entry => entry.message.type), [
    'set-paused',
    'set-paused',
    'restart',
    'drag-start',
    'drag-move',
    'drag-end'
  ]);

  client.dispose();
  assert.equal(worker.messages.at(-1).message.type, 'dispose');
  assert.equal(worker.terminated, true);
  assert.equal(activeStates.at(-1), false);
});

test('Pixi planning prioritizes viewport nodes and keeps forced labels over budget', async () => {
  const {
    areAllPixiNodesInBounds,
    drainPixiPendingLinks,
    hasEquivalentPixiTopology,
    prioritizePixiNodeMaterialization,
    remapEquivalentPixiTopology,
    selectPixiLabelNodeIds
  } = await importSourceModule('src/components/graph/pixiGraphPlanning.ts');
  const { buildSpatialIndex } = await importSourceModule('src/components/graph/spatialIndex.ts');
  const nodes = [
    { id: 'far', label: 'Far', x: 1000, y: 1000 },
    { id: 'near-b', label: 'Near B', x: 20, y: 20 },
    { id: 'near-a', label: 'Near A', x: 0, y: 0 }
  ];
  const prioritized = prioritizePixiNodeMaterialization(
    nodes,
    buildSpatialIndex(nodes),
    200,
    200,
    { x: 100, y: 100, scale: 1 }
  );

  assert.deepEqual(prioritized.map(node => node.id), ['near-a', 'near-b', 'far']);
  const containedBounds = { minX: -1, maxX: 30, minY: -1, maxY: 30 };
  assert.equal(areAllPixiNodesInBounds(nodes.slice(1), containedBounds), true);
  assert.equal(areAllPixiNodesInBounds(nodes, containedBounds), false);
  assert.equal(
    areAllPixiNodesInBounds([{ id: 'invalid', label: 'Invalid', x: Number.NaN, y: 0 }], containedBounds),
    false
  );
  assert.equal(
    areAllPixiNodesInBounds([], { minX: 10, maxX: -10, minY: 0, maxY: 1 }),
    false
  );

  const selected = selectPixiLabelNodeIds([
    { id: 'forced-a', inputIndex: 0, visibility: 1, degree: 1, forceVisible: true, isNeighbor: false },
    { id: 'forced-b', inputIndex: 1, visibility: 1, degree: 1, forceVisible: true, isNeighbor: false },
    { id: 'neighbor', inputIndex: 2, visibility: 0.2, degree: 1, forceVisible: false, isNeighbor: true },
    { id: 'degree', inputIndex: 3, visibility: 0.9, degree: 10, forceVisible: false, isNeighbor: false }
  ], 1);

  assert.deepEqual([...selected], ['forced-a', 'forced-b']);

  const pendingLinks = ['already', 'blocked', 'first', 'second', 'tail'];
  pendingLinks.shift = () => {
    throw new Error('pending-link draining must not shift the queue');
  };
  const materialized = new Set(['already']);
  const firstRemainingBudget = drainPixiPendingLinks(
    pendingLinks,
    2,
    link => materialized.has(link),
    link => {
      if (link === 'blocked') return false;
      materialized.add(link);
      return true;
    }
  );
  assert.equal(firstRemainingBudget, 0);
  assert.deepEqual([...pendingLinks], ['blocked', 'tail']);

  const secondRemainingBudget = drainPixiPendingLinks(
    pendingLinks,
    3,
    link => materialized.has(link),
    link => {
      materialized.add(link);
      return true;
    }
  );
  assert.equal(secondRemainingBudget, 1);
  assert.deepEqual([...pendingLinks], []);

  const previousLinks = [
    { source: nodes[2], target: nodes[1] },
    { source: nodes[1], target: nodes[0] }
  ];
  const equivalentNodes = nodes.map(node => ({ ...node, label: `${node.label}!` }));
  const equivalentLinks = [
    { source: 'near-a', target: 'near-b' },
    { source: 'near-b', target: 'far' }
  ];

  assert.equal(
    hasEquivalentPixiTopology(nodes, previousLinks, equivalentNodes, equivalentLinks),
    true
  );
  assert.equal(
    hasEquivalentPixiTopology(nodes, previousLinks, [...equivalentNodes].reverse(), equivalentLinks),
    false
  );
  assert.equal(
    hasEquivalentPixiTopology(nodes, previousLinks, equivalentNodes, [
      equivalentLinks[0],
      { source: 'near-b', target: 'near-a' }
    ]),
    false
  );

  const firstLinkView = { id: 'first-view' };
  const remapped = remapEquivalentPixiTopology(
    nodes,
    previousLinks,
    equivalentNodes,
    equivalentLinks,
    [nodes[1], nodes[0]],
    [previousLinks[1]],
    new Map([[previousLinks[0], firstLinkView]])
  );

  assert.ok(remapped);
  assert.deepEqual(remapped.pendingNodes, [equivalentNodes[1], equivalentNodes[0]]);
  assert.deepEqual(remapped.pendingLinks, [equivalentLinks[1]]);
  assert.equal(remapped.linkViews.get(equivalentLinks[0]), firstLinkView);
  assert.equal(remapped.nodeById.get('near-a'), equivalentNodes[2]);

  assert.equal(
    remapEquivalentPixiTopology(
      nodes,
      previousLinks,
      [...equivalentNodes].reverse(),
      equivalentLinks,
      [],
      [],
      new Map()
    ),
    null
  );
});

test('lazy Pixi renderer remains available without debug telemetry and delegates after initialization', async () => {
  const previousDebugRuntime = globalThis.__OGRAPH_DEBUG_RUNTIME__;
  globalThis.__OGRAPH_DEBUG_RUNTIME__ = false;

  try {
    const { LazyPixiGraphRendererBackend } = await importSourceModule(
      'src/components/graph/graphRenderer.ts'
    );
    let finishInitialization;
    let renderCalls = 0;
    let destroyCalls = 0;
    const concreteBackend = {
      kind: 'pixi',
      initialize: () => new Promise(resolve => {
        finishInitialization = resolve;
      }),
      render: () => {
        renderCalls += 1;
        return true;
      },
      destroy: () => {
        destroyCalls += 1;
      }
    };
    const lazyBackend = new LazyPixiGraphRendererBackend(async () => concreteBackend);
    const initialization = lazyBackend.initialize({});

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(lazyBackend.render({}), false);
    assert.equal(renderCalls, 0);

    finishInitialization();
    await initialization;
    assert.equal(lazyBackend.render({}), true);
    assert.equal(renderCalls, 1);

    lazyBackend.destroy();
    assert.equal(destroyCalls, 1);
  } finally {
    if (previousDebugRuntime === undefined) {
      delete globalThis.__OGRAPH_DEBUG_RUNTIME__;
    } else {
      globalThis.__OGRAPH_DEBUG_RUNTIME__ = previousDebugRuntime;
    }
  }
});

test('lazy Pixi renderer preserves initialization errors when partial cleanup also fails', async () => {
  const { LazyPixiGraphRendererBackend } = await importSourceModule(
    'src/components/graph/graphRenderer.ts'
  );
  const initializationError = new Error('Pixi initialization failed.');
  let destroyCalls = 0;
  const concreteBackend = {
    kind: 'pixi',
    initialize: async () => {
      throw initializationError;
    },
    render: () => false,
    destroy: () => {
      destroyCalls += 1;
      throw new Error('Partial Pixi cleanup failed.');
    }
  };
  const lazyBackend = new LazyPixiGraphRendererBackend(async () => concreteBackend);

  await assert.rejects(
    lazyBackend.initialize({}),
    caught => caught === initializationError
  );
  assert.equal(destroyCalls, 1);
  assert.equal(lazyBackend.render({}), false);
});

test('production runtime defaults to Pixi/Worker with per-lane automatic fallback', async () => {
  const {
    DEFAULT_GRAPH_RUNTIME_OPTIONS,
    resolveGraphRendererFallback,
    resolveGraphSimulationFallback
  } = await importSourceModule('src/components/graph/graphRuntime.ts');

  assert.equal(DEFAULT_GRAPH_RUNTIME_OPTIONS.renderer, 'pixi');
  assert.equal(DEFAULT_GRAPH_RUNTIME_OPTIONS.simulation, 'worker');
  assert.equal(DEFAULT_GRAPH_RUNTIME_OPTIONS.allowFallback, true);
  assert.equal(typeof DEFAULT_GRAPH_RUNTIME_OPTIONS.createSimulationWorker, 'function');
  assert.equal(resolveGraphRendererFallback('pixi', true), 'canvas2d');
  assert.equal(resolveGraphRendererFallback('canvas2d', true), null);
  assert.equal(resolveGraphRendererFallback('pixi', false), null);
  assert.equal(resolveGraphSimulationFallback('worker', true), 'main');
  assert.equal(resolveGraphSimulationFallback('main', true), null);
  assert.equal(resolveGraphSimulationFallback('worker', false), null);
});

test('buildLocalGraphScope keeps one hidden physics halo and merges transition scopes', async () => {
  const {
    buildLocalGraphScope,
    mergeGraphScopes
  } = await importSourceModule('src/components/graph/localGraph.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
    { id: 'd', label: 'D' },
    { id: 'e', label: 'E' }
  ];
  const links = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'd' },
    { source: 'd', target: 'e' }
  ];

  const scope = buildLocalGraphScope(nodes, links, 'a', 1);
  assert.deepEqual(scope.visibleGraph.nodes.map(node => node.id), ['a', 'b']);
  assert.deepEqual(scope.physicsGraph.nodes.map(node => node.id), ['a', 'b', 'c']);

  const nextScope = buildLocalGraphScope(nodes, links, 'e', 1);
  const merged = mergeGraphScopes(nodes, links, scope.physicsNodeIds, nextScope.physicsNodeIds);
  assert.deepEqual(merged.nodes.map(node => node.id), ['a', 'b', 'c', 'd', 'e']);

  const emptyScope = buildLocalGraphScope(nodes, links, 'missing', 2);
  assert.equal(emptyScope.visibleGraph.nodes.length, 0);
  assert.equal(emptyScope.physicsGraph.nodes.length, 0);
});

test('getLinkId handles string endpoints and d3-mutated object endpoints', async () => {
  const { getLinkId } = await importSourceModule('src/components/graph/localGraph.ts');

  assert.equal(getLinkId('note-a'), 'note-a');
  assert.equal(getLinkId({ id: 'note-b', label: 'Note B' }), 'note-b');
});

test('buildGraphIndexes and getFocusedNeighborSet share graph adjacency rules', async () => {
  const { buildGraphIndexes, getFocusedNeighborSet } = await importSourceModule('src/components/graph/graphIndexes.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' }
  ];
  const links = [
    { source: 'a', target: 'b' },
    { source: { id: 'b', label: 'B' }, target: { id: 'c', label: 'C' } }
  ];
  const indexes = buildGraphIndexes(nodes, links);
  const focusedNeighbors = getFocusedNeighborSet('b', indexes.adjacencyById);
  const emptyNeighbors = getFocusedNeighborSet(null, indexes.adjacencyById);

  assert.equal(indexes.nodeById.get('a'), nodes[0]);
  assert.equal(indexes.degreeById.get('b'), 2);
  assert.equal(focusedNeighbors, indexes.adjacencyById.get('b'));
  assert.deepEqual([...focusedNeighbors].sort(), ['a', 'c']);
  assert.equal(emptyNeighbors, getFocusedNeighborSet(undefined, indexes.adjacencyById));
  assert.deepEqual([...emptyNeighbors], []);
});

test('shared graph adjacency dedupes neighbors while degree keeps link counts', async () => {
  const { buildGraphIndexes, getFocusedNeighborSet } = await importSourceModule('src/components/graph/graphIndexes.ts');
  const { collectNodeIdsWithinDepth } = await importSourceModule('src/components/graph/localGraph.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' }
  ];
  const duplicateLinks = [
    { source: 'a', target: 'b' },
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' }
  ];
  const indexes = buildGraphIndexes(nodes, duplicateLinks);

  assert.deepEqual([...getFocusedNeighborSet('a', indexes.adjacencyById)], ['b']);
  assert.equal(indexes.degreeById.get('a'), 2);
  assert.deepEqual([...collectNodeIdsWithinDepth(nodes, duplicateLinks, 'a', 2)].sort(), ['a', 'b', 'c']);
});

test('graph link validation drops dangling endpoints before traversal and indexes', async () => {
  const { buildGraphIndexes, getFocusedNeighborSet } = await importSourceModule('src/components/graph/graphIndexes.ts');
  const { filterLocalGraph } = await importSourceModule('src/components/graph/localGraph.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' }
  ];
  const links = [
    { source: 'a', target: 'b' },
    { source: 'a', target: 'missing' }
  ];
  const indexes = buildGraphIndexes(nodes, links);
  const localGraph = filterLocalGraph(nodes, links, 'a', 1);

  assert.equal(indexes.validLinks.length, 1);
  assert.equal(indexes.degreeById.get('a'), 1);
  assert.deepEqual([...getFocusedNeighborSet('a', indexes.adjacencyById)], ['b']);
  assert.deepEqual(localGraph.nodes.map(node => node.id), ['a', 'b']);
  assert.deepEqual(localGraph.links.map(link => `${link.source}-${link.target}`), ['a-b']);
});

test('input sanitization keeps the first duplicate node and coerces invalid labels', async () => {
  const { sanitizeNodes } = await importSourceModule('src/components/graph/inputValidation.ts');
  const originalWarn = console.warn;
  const originalNodeEnv = process.env.NODE_ENV;
  const warnings = [];
  process.env.NODE_ENV = 'development';
  console.warn = message => warnings.push(String(message));

  try {
    const sanitized = sanitizeNodes([
      { id: 'a', label: 'First A', metadata: { kept: true } },
      { id: '', label: 'Empty' },
      { id: 123, label: 'Bad ID' },
      { id: 'a', label: 'Duplicate A' },
      { id: 'b', label: 42 }
    ]);

    assert.deepEqual(sanitized.map(node => [node.id, node.label]), [
      ['a', 'First A'],
      ['b', 'b']
    ]);
    assert.deepEqual(sanitized[0].metadata, { kept: true });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Duplicate node id "a"/);
  } finally {
    console.warn = originalWarn;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test('input sanitization removes malformed node sizes without mutating caller input', async () => {
  const { sanitizeNodes } = await importSourceModule('src/components/graph/inputValidation.ts');
  const nodes = [
    { id: 'valid', label: 'Valid', size: 2 },
    { id: 'zero', label: 'Zero', size: 0 },
    { id: 'negative', label: 'Negative', size: -1 },
    { id: 'nan', label: 'NaN', size: Number.NaN },
    { id: 'infinite', label: 'Infinite', size: Number.POSITIVE_INFINITY },
    { id: 'string', label: 'String', size: 'huge' }
  ];
  const snapshot = structuredClone(nodes);
  const sanitized = sanitizeNodes(nodes);

  assert.deepEqual(nodes, snapshot);
  assert.deepEqual(sanitized.map(node => [node.id, node.size]), [
    ['valid', 2],
    ['zero', 0],
    ['negative', undefined],
    ['nan', undefined],
    ['infinite', undefined],
    ['string', undefined]
  ]);
});

test('input sanitization drops dangling links and self-links', async () => {
  const { sanitizeLinks } = await importSourceModule('src/components/graph/inputValidation.ts');
  const nodeIds = new Set(['a', 'b', 'c']);
  const validObjectLink = { source: { id: 'b', label: 'B' }, target: 'c' };
  const sanitized = sanitizeLinks([
    { source: 'a', target: 'b' },
    { source: 'a', target: 'missing' },
    { source: 'a', target: 'a' },
    validObjectLink,
    { source: null, target: 'b' }
  ], nodeIds);

  assert.deepEqual(sanitized, [
    { source: 'a', target: 'b' },
    validObjectLink
  ]);
});

test('graph input normalization centralizes boundary invariants without mutating caller input', async () => {
  const { normalizeGraphInput } = await importSourceModule('src/components/graph/inputValidation.ts');
  const nodes = [
    {
      id: 'a',
      label: 'A',
      x: Number.NaN,
      y: 12,
      vx: Number.POSITIVE_INFINITY,
      vy: -2,
      fx: Number.NEGATIVE_INFINITY,
      fy: null,
      metadata: { kept: true }
    },
    { id: 'b', label: 'B' },
    { id: 'a', label: 'Duplicate A' },
    { id: '', label: 'Empty' }
  ];
  const links = [
    { source: 'a', target: 'b', label: 'valid' },
    { source: 'a', target: 'a', label: 'self' },
    { source: 'a', target: 'missing', label: 'dangling' },
    { source: { id: 'b', label: 'B' }, target: 'a', label: 'object endpoint' }
  ];
  const originalWarn = console.warn;
  const originalNodeEnv = process.env.NODE_ENV;
  const warnings = [];
  process.env.NODE_ENV = 'development';
  console.warn = message => warnings.push(String(message));

  try {
    const normalized = normalizeGraphInput({ nodes, links, localDepth: '3.8' });

    assert.deepEqual(normalized.nodes.map(node => node.id), ['a', 'b']);
    assert.equal(normalized.localDepth, 3);
    assert.deepEqual(normalized.links.map(link => link.label), ['valid', 'object endpoint']);
    assert.deepEqual([...normalized.nodeIds].sort(), ['a', 'b']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Duplicate node id "a"/);

    const normalizedA = normalized.nodes[0];
    assert.equal('x' in normalizedA, false);
    assert.equal(normalizedA.y, 12);
    assert.equal('vx' in normalizedA, false);
    assert.equal(normalizedA.vy, -2);
    assert.equal('fx' in normalizedA, false);
    assert.equal(normalizedA.fy, null);
    assert.deepEqual(normalizedA.metadata, { kept: true });

    assert.ok(Number.isNaN(nodes[0].x));
    assert.equal(nodes[0].vx, Number.POSITIVE_INFINITY);
    assert.equal(nodes[0].fx, Number.NEGATIVE_INFINITY);
    assert.equal(nodes.length, 4);
    assert.equal(links.length, 4);

    const normalizedAgain = normalizeGraphInput({
      nodes: normalized.nodes,
      links: normalized.links,
      localDepth: normalized.localDepth
    });
    assert.deepEqual(normalizedAgain.nodes, normalized.nodes);
    assert.deepEqual(normalizedAgain.links, normalized.links);
    assert.equal(normalizedAgain.localDepth, normalized.localDepth);
  } finally {
    console.warn = originalWarn;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test('input sanitization clamps local depth to supported positive integers', async () => {
  const { sanitizeLocalDepth } = await importSourceModule('src/components/graph/inputValidation.ts');

  assert.equal(sanitizeLocalDepth(0), 1);
  assert.equal(sanitizeLocalDepth(-5), 1);
  assert.equal(sanitizeLocalDepth(Number.NaN), 1);
  assert.equal(sanitizeLocalDepth('4'), 4);
  assert.equal(sanitizeLocalDepth(2.9), 2);
  assert.equal(sanitizeLocalDepth(1000), 10);
});

test('seeded graph normalization sweep preserves boundary invariants without mutating caller input', async () => {
  const { normalizeGraphInput } = await importSourceModule('src/components/graph/inputValidation.ts');
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    for (let seed = 1; seed <= 80; seed += 1) {
      const input = createRandomGraphInput(seed);
      const inputSnapshot = structuredClone(input);
      const normalized = normalizeGraphInput(input);
      const nodeIds = new Set();

      assert.deepEqual(input, inputSnapshot, `seed ${seed} mutated caller input`);
      assert.equal(Number.isInteger(normalized.localDepth), true, `seed ${seed} localDepth is not an integer`);
      assert.equal(normalized.localDepth >= 1 && normalized.localDepth <= 10, true, `seed ${seed} localDepth is out of range`);
      assert.equal(normalized.nodes.length <= input.nodes.length, true, `seed ${seed} increased node count`);
      assert.equal(normalized.links.length <= input.links.length, true, `seed ${seed} increased link count`);
      assert.deepEqual([...normalized.nodeIds], normalized.nodes.map(node => node.id), `seed ${seed} nodeIds lost node order`);

      for (const node of normalized.nodes) {
        assert.equal(typeof node.id, 'string', `seed ${seed} kept a non-string node id`);
        assert.notEqual(node.id, '', `seed ${seed} kept an empty node id`);
        assert.equal(nodeIds.has(node.id), false, `seed ${seed} kept duplicate node id ${node.id}`);
        assert.equal(typeof node.label, 'string', `seed ${seed} kept a non-string label for ${node.id}`);
        assert.equal(
          node.size === undefined || (typeof node.size === 'number' && Number.isFinite(node.size) && node.size >= 0),
          true,
          `seed ${seed} kept invalid size for ${node.id}`
        );

        for (const key of ['x', 'y', 'vx', 'vy']) {
          assert.equal(
            node[key] === undefined || (typeof node[key] === 'number' && Number.isFinite(node[key])),
            true,
            `seed ${seed} kept invalid ${key} for ${node.id}`
          );
        }

        for (const key of ['fx', 'fy']) {
          assert.equal(
            node[key] === undefined || node[key] === null || (typeof node[key] === 'number' && Number.isFinite(node[key])),
            true,
            `seed ${seed} kept invalid ${key} for ${node.id}`
          );
        }

        nodeIds.add(node.id);
      }

      for (const link of normalized.links) {
        const sourceId = getEndpointId(link.source);
        const targetId = getEndpointId(link.target);

        assert.equal(nodeIds.has(sourceId), true, `seed ${seed} kept dangling source ${sourceId}`);
        assert.equal(nodeIds.has(targetId), true, `seed ${seed} kept dangling target ${targetId}`);
        assert.notEqual(sourceId, targetId, `seed ${seed} kept self-link ${sourceId}`);
      }

      const normalizedAgain = normalizeGraphInput({
        nodes: normalized.nodes,
        links: normalized.links,
        localDepth: normalized.localDepth
      });

      assert.deepEqual(normalizedAgain.nodes, normalized.nodes, `seed ${seed} normalization is not node-idempotent`);
      assert.deepEqual(normalizedAgain.links, normalized.links, `seed ${seed} normalization is not link-idempotent`);
      assert.equal(normalizedAgain.localDepth, normalized.localDepth, `seed ${seed} normalization is not depth-idempotent`);
    }
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test('empty graphs return empty traversal, index, and topology results', async () => {
  const { buildGraphIndexes } = await importSourceModule('src/components/graph/graphIndexes.ts');
  const { buildLocalGraphScope, filterLocalGraph } = await importSourceModule('src/components/graph/localGraph.ts');
  const { getGraphTopologySignature, resolveSimulationGravityCenter } = await importSourceModule('src/components/graph/useGraphSimulation.ts');

  const indexes = buildGraphIndexes([], []);
  const localGraph = filterLocalGraph([], [], null, 2);
  const scope = buildLocalGraphScope([], [], 'missing', 2);

  assert.equal(indexes.nodeById.size, 0);
  assert.equal(indexes.adjacencyById.size, 0);
  assert.equal(indexes.degreeById.size, 0);
  assert.deepEqual(indexes.validLinks, []);
  assert.deepEqual(localGraph, { nodes: [], links: [] });
  assert.deepEqual(scope.visibleGraph, { nodes: [], links: [] });
  assert.deepEqual(scope.physicsGraph, { nodes: [], links: [] });
  assert.equal(getGraphTopologySignature([], []), '[[],[]]');
  assert.deepEqual(resolveSimulationGravityCenter([], true), { x: 0, y: 0 });
});

test('self-links are ignored by traversal and indexes', async () => {
  const { buildGraphIndexes, getFocusedNeighborSet } = await importSourceModule('src/components/graph/graphIndexes.ts');
  const { filterLocalGraph } = await importSourceModule('src/components/graph/localGraph.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' }
  ];
  const links = [
    { source: 'a', target: 'a' },
    { source: 'a', target: 'b' }
  ];
  const indexes = buildGraphIndexes(nodes, links);
  const localGraph = filterLocalGraph(nodes, links, 'a', 1);

  assert.equal(indexes.validLinks.length, 1);
  assert.equal(indexes.degreeById.get('a'), 1);
  assert.deepEqual([...getFocusedNeighborSet('a', indexes.adjacencyById)], ['b']);
  assert.deepEqual(localGraph.links.map(link => `${link.source}-${link.target}`), ['a-b']);
});

test('large duplicate link sets keep traversal set-based and degree count-based', async () => {
  const { buildGraphIndexes, getFocusedNeighborSet } = await importSourceModule('src/components/graph/graphIndexes.ts');
  const { collectNodeIdsWithinDepth } = await importSourceModule('src/components/graph/localGraph.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' }
  ];
  const links = Array.from({ length: 100 }, () => ({ source: 'a', target: 'b' }));
  const indexes = buildGraphIndexes(nodes, links);

  assert.equal(indexes.validLinks.length, 100);
  assert.equal(indexes.degreeById.get('a'), 100);
  assert.deepEqual([...getFocusedNeighborSet('a', indexes.adjacencyById)], ['b']);
  assert.deepEqual([...collectNodeIdsWithinDepth(nodes, links, 'a', 1000)], ['a', 'b']);
});

test('unicode, whitespace, and control-character node ids remain valid graph ids', async () => {
  const { buildGraphIndexes } = await importSourceModule('src/components/graph/graphIndexes.ts');
  const { collectNodeIdsWithinDepth } = await importSourceModule('src/components/graph/localGraph.ts');
  const nodes = [
    { id: ' spaced id ', label: 'Spaces' },
    { id: 'emoji-😀', label: 'Emoji' },
    { id: 'ctrl-\u0001', label: 'Control' }
  ];
  const links = [
    { source: ' spaced id ', target: 'emoji-😀' },
    { source: 'emoji-😀', target: 'ctrl-\u0001' }
  ];
  const indexes = buildGraphIndexes(nodes, links);

  assert.equal(indexes.validLinks.length, 2);
  assert.deepEqual(
    [...collectNodeIdsWithinDepth(nodes, links, ' spaced id ', 2)].sort(),
    [' spaced id ', 'ctrl-\u0001', 'emoji-😀'].sort()
  );
});

test('very large local depth terminates on small graphs', async () => {
  const { collectNodeIdsWithinDepth } = await importSourceModule('src/components/graph/localGraph.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' }
  ];
  const links = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' }
  ];

  assert.deepEqual([...collectNodeIdsWithinDepth(nodes, links, 'a', 1000)].sort(), ['a', 'b', 'c']);
});

test('graph topology signature ignores references, ordering, and payload-only changes', async () => {
  const { getGraphTopologySignature } = await importSourceModule('src/components/graph/useGraphSimulation.ts');
  const baseNodes = [
    { id: 'b', label: 'Beta', type: 'note', size: 1 },
    { id: 'a', label: 'Alpha', type: 'tag', group: 'left', metadata: { rank: 1 } }
  ];
  const baseLinks = [
    { source: 'a', target: 'b', label: 'A to B', weight: 1, strength: 0.2 },
    { source: 'a', target: 'missing', label: 'Ignored dangling link' }
  ];
  const sameTopologyNodes = [
    { id: 'a', label: 'Alpha renamed', type: 'hub', group: 'right', size: 3, metadata: { rank: 2 } },
    { id: 'b', label: 'Beta renamed', type: 'structure', size: 0.5 }
  ];
  const sameTopologyLinks = [
    { source: 'missing-other', target: 'a', label: 'Still ignored' },
    {
      source: { id: 'b', label: 'Object endpoint B' },
      target: { id: 'a', label: 'Object endpoint A' },
      label: 'Reversed endpoint order',
      weight: 9,
      strength: 0.9,
      metadata: { changed: true }
    }
  ];

  assert.equal(
    getGraphTopologySignature(baseNodes, baseLinks),
    getGraphTopologySignature(sameTopologyNodes, sameTopologyLinks)
  );
});

test('graph topology signature tracks node IDs, valid links, and duplicate link counts', async () => {
  const { getGraphTopologySignature } = await importSourceModule('src/components/graph/useGraphSimulation.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' }
  ];
  const baseLinks = [
    { source: 'a', target: 'b' },
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'a', target: 'missing' }
  ];
  const baseSignature = getGraphTopologySignature(nodes, baseLinks);

  assert.equal(
    baseSignature,
    getGraphTopologySignature(nodes, [
      { source: 'missing-other', target: 'a' },
      { source: 'b', target: 'a' },
      { source: 'c', target: 'b' },
      { source: 'b', target: 'a' }
    ])
  );
  assert.notEqual(
    baseSignature,
    getGraphTopologySignature(nodes, [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' }
    ])
  );
  assert.notEqual(
    baseSignature,
    getGraphTopologySignature([...nodes, { id: 'd', label: 'D' }], baseLinks)
  );
  assert.notEqual(
    baseSignature,
    getGraphTopologySignature([...nodes, { id: 'a', label: 'Duplicate A' }], baseLinks)
  );
  assert.notEqual(
    baseSignature,
    getGraphTopologySignature(nodes, [...baseLinks, { source: 'a', target: 'c' }])
  );
});

test('graph topology signature ignores self-links consistently', async () => {
  const { getGraphTopologySignature } = await importSourceModule('src/components/graph/useGraphSimulation.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' }
  ];
  const withoutSelfLink = [{ source: 'a', target: 'b' }];
  const withSelfLinks = [
    { source: 'a', target: 'a' },
    { source: { id: 'b', label: 'B' }, target: { id: 'b', label: 'B' } },
    { source: 'b', target: 'a' }
  ];

  assert.equal(
    getGraphTopologySignature(nodes, withoutSelfLink),
    getGraphTopologySignature(nodes, withSelfLinks)
  );
});

test('graph growth sequence orders nodes by timestamp with input-order fallback', async () => {
  const {
    buildGraphGrowthSequence,
    filterGraphByGrowthStep,
    parseGraphGrowthTimestamp,
    resolveGraphGrowthAnimationOptions
  } = await importSourceModule('src/components/graph/useGraphGrowthAnimation.ts');
  const nodes = [
    { id: 'late', label: 'Late', metadata: { createdAt: '2026-01-03T00:00:00.000Z' } },
    { id: 'undated', label: 'Undated', metadata: { createdAt: 'not-a-date' } },
    { id: 'early', label: 'Early', metadata: { createdAt: new Date('2026-01-01T00:00:00.000Z') } },
    { id: 'tie', label: 'Tie', metadata: { createdAt: '2026-01-01T00:00:00.000Z' } }
  ];
  const links = [
    { source: 'early', target: 'tie' },
    { source: 'tie', target: 'late' },
    { source: 'undated', target: 'early' }
  ];
  const options = resolveGraphGrowthAnimationOptions(true);
  const sequence = buildGraphGrowthSequence(nodes, options);

  assert.deepEqual(sequence.items.map(item => item.id), ['early', 'tie', 'late', 'undated']);
  assert.equal(parseGraphGrowthTimestamp(''), null);
  assert.equal(parseGraphGrowthTimestamp(Number.NaN), null);

  const firstTwo = filterGraphByGrowthStep(nodes, links, sequence, 2);
  assert.deepEqual(firstTwo.nodes.map(node => node.id), ['early', 'tie']);
  assert.deepEqual(firstTwo.links, [{ source: 'early', target: 'tie' }]);
  assert.equal(firstTwo.isComplete, false);

  const complete = filterGraphByGrowthStep(nodes, links, sequence, 99);
  assert.deepEqual(complete.nodes, nodes);
  assert.deepEqual(complete.links, links);
  assert.equal(complete.isComplete, true);
});

test('graph growth options support custom timestamp extractors and safe timing defaults', async () => {
  const {
    DEFAULT_GRAPH_GROWTH_STEP_MS,
    buildGraphGrowthSequence,
    getInitialGraphGrowthRevealedCount,
    resolveGraphGrowthAnimationOptions
  } = await importSourceModule('src/components/graph/useGraphGrowthAnimation.ts');
  const nodes = [
    { id: 'b', label: 'B', metadata: { order: 2 } },
    { id: 'a', label: 'A', metadata: { order: 1 } }
  ];
  const options = resolveGraphGrowthAnimationOptions({
    getNodeTimestamp: node => node.metadata.order,
    stepMs: -10,
    initialDelayMs: Number.NaN
  });

  assert.equal(options.enabled, true);
  assert.equal(options.stepMs, DEFAULT_GRAPH_GROWTH_STEP_MS);
  assert.equal(options.initialDelayMs, 0);
  assert.deepEqual(buildGraphGrowthSequence(nodes, options).items.map(item => item.id), ['a', 'b']);
  assert.equal(getInitialGraphGrowthRevealedCount(3, true, 0), 1);
  assert.equal(getInitialGraphGrowthRevealedCount(3, true, 100), 0);
  assert.equal(getInitialGraphGrowthRevealedCount(3, false, 100), 3);
  assert.equal(resolveGraphGrowthAnimationOptions(false).enabled, false);
  assert.equal(resolveGraphGrowthAnimationOptions({ enabled: false }).enabled, false);
});

test('disabled graph growth returns the complete graph without reading timestamps', async () => {
  const {
    useGraphGrowthAnimation
  } = await importHookModuleWithReactStub('src/components/graph/useGraphGrowthAnimation.ts');
  const nodes = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' }
  ];
  const links = [{ source: 'a', target: 'b' }];

  const frame = useGraphGrowthAnimation({
    nodes,
    links,
    animation: {
      enabled: false,
      getNodeTimestamp: () => {
        throw new Error('disabled growth must not read timestamps');
      }
    },
    reduceMotion: false
  });

  assert.equal(frame.nodes, nodes);
  assert.equal(frame.links, links);
  assert.deepEqual([...frame.revealedNodeIds], ['a', 'b']);
  assert.equal(frame.isComplete, true);
});

test('diffGraph reports deterministic node and duplicate-link patches without mutating inputs', async () => {
  const { diffGraph, getGraphLinkDiffKey } = await importSourceModule('src/components/graph/graphDiff.ts');
  const stableNode = { id: 'a', label: 'A' };
  const removedNode = { id: 'b', label: 'B' };
  const previousUpdatedNode = { id: 'c', label: 'Old C' };
  const nextUpdatedNode = { id: 'c', label: 'New C' };
  const addedNode = { id: 'd', label: 'D' };
  const stableLink = { source: 'a', target: 'b', label: 'stable' };
  const removedLink = { source: 'b', target: 'c', label: 'removed' };
  const previousUpdatedDuplicateLink = { source: 'a', target: 'b', label: 'duplicate old' };
  const nextUpdatedDuplicateLink = { source: 'a', target: 'b', label: 'duplicate new' };
  const addedLink = { source: 'c', target: 'd', label: 'added' };
  const previous = {
    nodes: [stableNode, removedNode, previousUpdatedNode],
    links: [stableLink, removedLink, previousUpdatedDuplicateLink]
  };
  const next = {
    nodes: [stableNode, nextUpdatedNode, addedNode],
    links: [stableLink, nextUpdatedDuplicateLink, addedLink]
  };
  const previousSnapshot = JSON.stringify(previous);
  const nextSnapshot = JSON.stringify(next);

  const patch = diffGraph(previous, next);

  assert.deepEqual(patch.addedNodes, [addedNode]);
  assert.deepEqual(patch.removedNodeIds, ['b']);
  assert.deepEqual(patch.updatedNodes, [nextUpdatedNode]);
  assert.deepEqual(patch.addedLinks, [addedLink]);
  assert.deepEqual(patch.updatedLinks, [nextUpdatedDuplicateLink]);
  assert.deepEqual(patch.removedLinks, [
    {
      key: getGraphLinkDiffKey(removedLink, 0),
      link: removedLink
    }
  ]);
  assert.equal(getGraphLinkDiffKey(nextUpdatedDuplicateLink, 1), `a\u0000b\u00001`);
  assert.equal(JSON.stringify(previous), previousSnapshot);
  assert.equal(JSON.stringify(next), nextSnapshot);
});

test('diffGraph accepts structural equality comparators for payload-stable records', async () => {
  const { diffGraph } = await importSourceModule('src/components/graph/graphDiff.ts');
  const previous = {
    nodes: [{ id: 'a', label: 'A', metadata: { rank: 1 } }],
    links: [{ source: 'a', target: 'b', metadata: { relation: 'same' } }]
  };
  const next = {
    nodes: [{ id: 'a', label: 'A', metadata: { rank: 1 } }],
    links: [{ source: 'a', target: 'b', metadata: { relation: 'same' } }]
  };

  const defaultPatch = diffGraph(previous, next);
  assert.equal(defaultPatch.updatedNodes.length, 1);
  assert.equal(defaultPatch.updatedLinks.length, 1);

  const structuralPatch = diffGraph(previous, next, {
    areNodesEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    areLinksEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right)
  });

  assert.deepEqual(structuralPatch, {
    addedNodes: [],
    removedNodeIds: [],
    updatedNodes: [],
    addedLinks: [],
    removedLinks: [],
    updatedLinks: []
  });
});

test('seeded diffGraph sweep remains deterministic and mutation-free across normalized inputs', async () => {
  const { normalizeGraphInput } = await importSourceModule('src/components/graph/inputValidation.ts');
  const { diffGraph } = await importSourceModule('src/components/graph/graphDiff.ts');
  const options = {
    areNodesEqual: structurallyEqual,
    areLinksEqual: structurallyEqual
  };
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    for (let seed = 101; seed <= 160; seed += 1) {
      const previousNormalized = normalizeGraphInput(createRandomGraphInput(seed));
      const nextNormalized = normalizeGraphInput(createRandomGraphInput(seed + 1000));
      const previous = {
        nodes: previousNormalized.nodes,
        links: previousNormalized.links
      };
      const next = {
        nodes: nextNormalized.nodes,
        links: nextNormalized.links
      };
      const snapshot = structuredClone({ previous, next });
      const previousIds = new Set(previous.nodes.map(node => node.id));
      const nextIds = new Set(next.nodes.map(node => node.id));

      const patch = diffGraph(previous, next, options);
      const patchAgain = diffGraph(previous, next, options);
      const emptyPatch = diffGraph(previous, previous, options);

      assert.deepEqual(patchAgain, patch, `seed ${seed} diff is not deterministic`);
      assert.deepEqual({ previous, next }, snapshot, `seed ${seed} diff mutated input graphs`);
      assertEmptyPatch(emptyPatch, `seed ${seed} self diff is not empty`);

      for (const node of patch.addedNodes) {
        assert.equal(previousIds.has(node.id), false, `seed ${seed} added existing node ${node.id}`);
        assert.equal(nextIds.has(node.id), true, `seed ${seed} added missing next node ${node.id}`);
        assert.equal(next.nodes.includes(node), true, `seed ${seed} added node is not from next graph`);
      }

      for (const nodeId of patch.removedNodeIds) {
        assert.equal(previousIds.has(nodeId), true, `seed ${seed} removed missing previous node ${nodeId}`);
        assert.equal(nextIds.has(nodeId), false, `seed ${seed} removed existing next node ${nodeId}`);
      }

      for (const node of patch.updatedNodes) {
        assert.equal(previousIds.has(node.id), true, `seed ${seed} updated missing previous node ${node.id}`);
        assert.equal(nextIds.has(node.id), true, `seed ${seed} updated missing next node ${node.id}`);
        assert.equal(next.nodes.includes(node), true, `seed ${seed} updated node is not from next graph`);
      }

      for (const link of patch.addedLinks) {
        assert.equal(next.links.includes(link), true, `seed ${seed} added link is not from next graph`);
      }

      for (const link of patch.updatedLinks) {
        assert.equal(next.links.includes(link), true, `seed ${seed} updated link is not from next graph`);
      }

      for (const removed of patch.removedLinks) {
        assert.equal(previous.links.includes(removed.link), true, `seed ${seed} removed link is not from previous graph`);
        assert.equal(typeof removed.key, 'string', `seed ${seed} removed link key is not stable text`);
      }
    }
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test('findNodeAtPosition respects viewport conversion and minimum screen hit target', async () => {
  const { findNodeAtPosition } = await importSourceModule('src/components/graph/hitTest.ts');
  const nodes = [
    { id: 'a', label: 'A', x: 10, y: 10, size: 1, degree: 0 },
    { id: 'b', label: 'B', x: 100, y: 100, size: 1, degree: 0 }
  ];

  const directHit = findNodeAtPosition(nodes, 120, 70, { x: 100, y: 50, scale: 2 }, 4, 1);
  assert.equal(directHit?.id, 'a');

  const minTargetHit = findNodeAtPosition(
    [{ id: 'tiny', label: 'Tiny', x: 0, y: 0, size: 0.1, degree: 0 }],
    4,
    0,
    { x: 0, y: 0, scale: 0.5 },
    1,
    1
  );
  assert.equal(minTargetHit?.id, 'tiny');

  const miss = findNodeAtPosition(nodes, 400, 400, { x: 0, y: 0, scale: 1 }, 4, 1);
  assert.equal(miss, null);
});

test('findNodeAtPosition rejects invalid viewport and node coordinates', async () => {
  const { canHitTestViewport, findNodeAtPosition } = await importSourceModule('src/components/graph/hitTest.ts');
  const nodes = [
    { id: 'origin', label: 'Origin', x: 0, y: 0, size: 1, degree: 0 },
    { id: 'bad', label: 'Bad', x: Number.NaN, y: 0, size: 1, degree: 0 }
  ];

  assert.equal(canHitTestViewport(0, 0, { x: 0, y: 0, scale: 1 }), true);
  assert.equal(canHitTestViewport(0, 0, { x: 0, y: 0, scale: 0 }), false);
  assert.equal(findNodeAtPosition(nodes, 0, 0, { x: 0, y: 0, scale: 0 }, 4, 1), null);
  assert.equal(findNodeAtPosition(nodes, Number.NaN, 0, { x: 0, y: 0, scale: 1 }, 4, 1), null);
  assert.equal(
    findNodeAtPosition([nodes[1]], 0, 0, { x: 0, y: 0, scale: 1 }, 4, 1),
    null
  );
});

test('graphMath returns stable radius and label visibility values', async () => {
  const { getNodeRadius, resolveLabelVisibilityTarget } = await importSourceModule('src/components/graph/graphMath.ts');
  const expectedRadius = 4 * 2 * (1 + Math.log1p(3) * 0.4) * 1.5;

  assert.equal(getNodeRadius(4, 1.5, 2, 3), expectedRadius);
  assert.equal(getNodeRadius(4, 1, -2, 0), 4);
  assert.equal(getNodeRadius(4, 1, Number.NaN, 0), 4);
  assert.equal(getNodeRadius(4, 1, 0, 0), 0);
  assert.equal(getNodeRadius(4, 1, 1, -2), 4);
  assert.equal(resolveLabelVisibilityTarget(0, 1, 0.5, true), 1);
  assert.equal(resolveLabelVisibilityTarget(0, 0.1, 0, false), 0);
  assert.ok(resolveLabelVisibilityTarget(10, 1, 0.5, false) > 0);
});

test('label render budgets normalize interaction fallbacks and invalid values', async () => {
  const { resolveLabelRenderBudget } = await importSourceModule('src/components/graph/canvasRenderer.ts');

  assert.equal(resolveLabelRenderBudget(undefined, false), undefined);
  assert.equal(resolveLabelRenderBudget({ maxLabels: 12.8 }, false), 12);
  assert.equal(resolveLabelRenderBudget({ maxLabels: 12.8 }, true), 12);
  assert.equal(
    resolveLabelRenderBudget({ maxLabels: 12, maxLabelsDuringInteraction: 4.9 }, true),
    4
  );
  assert.equal(resolveLabelRenderBudget({ maxLabels: 12, maxLabelsDuringInteraction: 0 }, true), 0);
  assert.equal(resolveLabelRenderBudget({ maxLabels: -1 }, false), undefined);
  assert.equal(resolveLabelRenderBudget({ maxLabels: Number.NaN }, false), undefined);
  assert.equal(resolveLabelRenderBudget({ maxLabels: Number.POSITIVE_INFINITY }, false), undefined);
  assert.equal(
    resolveLabelRenderBudget({ maxLabels: 12, maxLabelsDuringInteraction: Number.NaN }, true),
    undefined
  );
});

test('label render budget preserves forced labels and ranks neighbors deterministically', async () => {
  const { selectLabelNodeIdsForBudget } = await importSourceModule('src/components/graph/canvasRenderer.ts');
  const candidates = [
    { id: 'ordinary-high', index: 0, forceVisible: false, isNeighbor: false, visibility: 1, degree: 20 },
    { id: 'forced-selected', index: 1, forceVisible: true, isNeighbor: false, visibility: 1, degree: 0 },
    { id: 'neighbor-low', index: 2, forceVisible: false, isNeighbor: true, visibility: 0.2, degree: 1 },
    { id: 'ordinary-tie-a', index: 3, forceVisible: false, isNeighbor: false, visibility: 0.5, degree: 3 },
    { id: 'ordinary-tie-b', index: 4, forceVisible: false, isNeighbor: false, visibility: 0.5, degree: 3 }
  ];

  assert.deepEqual(
    [...selectLabelNodeIdsForBudget(candidates, 3)],
    ['forced-selected', 'neighbor-low', 'ordinary-high']
  );
  assert.deepEqual(
    [...selectLabelNodeIdsForBudget(candidates, 1)],
    ['forced-selected']
  );

  const forcedOverflow = selectLabelNodeIdsForBudget([
    ...candidates,
    { id: 'forced-root', index: 5, forceVisible: true, isNeighbor: false, visibility: 1, degree: 0 }
  ], 1);
  assert.deepEqual([...forcedOverflow], ['forced-selected', 'forced-root']);
});

test('canvas label paint calls are capped before strokeText and fillText', async () => {
  const { drawGraph } = await importSourceModule('src/components/graph/canvasRenderer.ts');
  const { defaultGraphPreset, defaultGraphTheme } = await importSourceModule('src/components/graph/presets.ts');
  const strokedLabels = [];
  const filledLabels = [];
  const ctx = {
    arc() {},
    beginPath() {},
    fill() {},
    fillRect() {},
    fillText(label) {
      filledLabels.push(label);
    },
    lineTo() {},
    moveTo() {},
    restore() {},
    save() {},
    scale() {},
    stroke() {},
    strokeText(label) {
      strokedLabels.push(label);
    },
    translate() {}
  };
  const nodes = [
    { id: 'low', label: 'Low', x: 20, y: 20, degree: 1 },
    { id: 'high', label: 'High', x: 40, y: 20, degree: 10 },
    { id: 'medium', label: 'Medium', x: 60, y: 20, degree: 5 }
  ];

  drawGraph(
    ctx,
    100,
    100,
    nodes,
    [],
    { x: 0, y: 0, scale: 1 },
    defaultGraphTheme,
    { ...defaultGraphPreset, labelDensity: 1 },
    null,
    null,
    null,
    new Set(),
    1,
    new Map(nodes.map(node => [node.id, 1])),
    undefined,
    undefined,
    2
  );

  assert.deepEqual(strokedLabels, ['High', 'Medium']);
  assert.deepEqual(filledLabels, ['High', 'Medium']);
});

test('canvas nodes erase and restore their backdrop before drawing translucent fills', async () => {
  const { drawGraph } = await importSourceModule('src/components/graph/canvasRenderer.ts');
  const { defaultGraphPreset, defaultGraphTheme } = await importSourceModule('src/components/graph/presets.ts');
  const compositeModes = [];
  const ctx = {
    arc() {},
    beginPath() {},
    fill() {},
    fillRect() {},
    fillText() {},
    lineTo() {},
    moveTo() {},
    restore() {},
    save() {},
    scale() {},
    stroke() {},
    strokeText() {},
    translate() {},
    set globalCompositeOperation(value) {
      compositeModes.push(value);
    }
  };
  const source = { id: 'source', label: 'Source', x: 20, y: 50, degree: 1 };
  const target = { id: 'target', label: 'Target', x: 80, y: 50, degree: 1 };

  drawGraph(
    ctx,
    100,
    100,
    [source, target],
    [{ source, target }],
    { x: 0, y: 0, scale: 1 },
    { ...defaultGraphTheme, backgroundColor: 'rgba(0, 0, 0, 0)' },
    defaultGraphPreset,
    'source',
    null,
    null,
    new Set(['target']),
    1
  );

  assert.deepEqual(compositeModes, ['destination-out', 'source-over']);
});

test('canvas label budget keeps source-order tie breaks when spatial index order differs', async () => {
  const { drawGraph } = await importSourceModule('src/components/graph/canvasRenderer.ts');
  const { defaultGraphPreset, defaultGraphTheme } = await importSourceModule('src/components/graph/presets.ts');
  const filledLabels = [];
  const ctx = {
    arc() {},
    beginPath() {},
    fill() {},
    fillRect() {},
    fillText(label) {
      filledLabels.push(label);
    },
    lineTo() {},
    moveTo() {},
    restore() {},
    save() {},
    scale() {},
    stroke() {},
    strokeText() {},
    translate() {}
  };
  const nodes = [
    { id: 'source-first', label: 'Source First', x: 120, y: 20, degree: 1 },
    { id: 'query-first', label: 'Query First', x: 20, y: 20, degree: 1 }
  ];
  const spatialIndex = {
    cellSize: 100,
    cells: new Map([
      ['0:0', [nodes[1]]],
      ['1:0', [nodes[0]]]
    ])
  };

  drawGraph(
    ctx,
    200,
    100,
    nodes,
    [],
    { x: 0, y: 0, scale: 1 },
    defaultGraphTheme,
    { ...defaultGraphPreset, labelDensity: 1 },
    null,
    null,
    null,
    new Set(),
    1,
    new Map(nodes.map(node => [node.id, 1])),
    undefined,
    spatialIndex,
    1
  );

  assert.deepEqual(filledLabels, ['Source First']);
});

test('local lens drag physics keeps low simulation heat without connected-node wake', async () => {
  const {
    DEFAULT_GRAPH_DRAG_PHYSICS,
    LOCAL_LENS_DRAG_PHYSICS,
    getGraphDragPhysicsForMode
  } = await importSourceModule('src/components/graph/useGraphSimulation.ts');
  const globalDragPhysics = getGraphDragPhysicsForMode('global');
  const localDragPhysics = getGraphDragPhysicsForMode('local');

  assert.deepEqual(globalDragPhysics, DEFAULT_GRAPH_DRAG_PHYSICS);
  assert.equal(globalDragPhysics.wakeConnectedNodes, true);
  assert.ok(globalDragPhysics.startAlphaTarget > 0);
  assert.ok(globalDragPhysics.moveAlphaTarget > 0);

  assert.deepEqual(localDragPhysics, LOCAL_LENS_DRAG_PHYSICS);
  assert.equal(localDragPhysics.wakeConnectedNodes, false);
  assert.ok(localDragPhysics.startAlphaTarget > 0);
  assert.ok(localDragPhysics.moveAlphaTarget > 0);
  assert.ok(localDragPhysics.startAlphaTarget < globalDragPhysics.startAlphaTarget);
  assert.ok(localDragPhysics.moveAlphaTarget < globalDragPhysics.moveAlphaTarget);
});

test('velocity decay defaults and clamps to the d3-force range', async () => {
  const { resolveVelocityDecay } = await importSourceModule('src/components/graph/useGraphSimulation.ts');

  assert.equal(resolveVelocityDecay(), 0.4);
  assert.equal(resolveVelocityDecay(Number.NaN), 0.4);
  assert.equal(resolveVelocityDecay(-0.5), 0);
  assert.equal(resolveVelocityDecay(0.25), 0.25);
  assert.equal(resolveVelocityDecay(1.5), 1);
});

test('graph cooling uses local defaults while allowing alpha decay overrides', async () => {
  const { resolveGraphCoolingOptions } = await importSourceModule('src/components/graph/useGraphSimulation.ts');
  const globalCooling = resolveGraphCoolingOptions('global');
  const localCooling = resolveGraphCoolingOptions('local');

  assert.ok(globalCooling.alphaDecay > 0.022);
  assert.ok(globalCooling.alphaDecay < 0.023);
  assert.equal(globalCooling.alphaMin, 0.001);

  assert.equal(localCooling.alphaDecay, 0.08);
  assert.equal(localCooling.alphaMin, 0.005);

  assert.deepEqual(resolveGraphCoolingOptions('local', 0.05), {
    alphaDecay: 0.05,
    alphaMin: 0.005
  });
  assert.equal(resolveGraphCoolingOptions('local', Number.NaN).alphaDecay, 0.08);
  assert.equal(resolveGraphCoolingOptions('local', -0.1).alphaDecay, 0.08);
  assert.equal(resolveGraphCoolingOptions('global', 1.5).alphaDecay, 1);
});

test('local graph cooling keeps small refreshes below the old long-tail tick count', async () => {
  const { resolveGraphCoolingOptions } = await importSourceModule('src/components/graph/useGraphSimulation.ts');
  const estimateCoolingTicks = (alphaStart, alphaMin, alphaDecay) => {
    return Math.ceil(Math.log(alphaMin / alphaStart) / Math.log(1 - alphaDecay));
  };
  const localCooling = resolveGraphCoolingOptions('local');
  const globalCooling = resolveGraphCoolingOptions('global');
  const rootChangeTicks = estimateCoolingTicks(0.04, localCooling.alphaMin, localCooling.alphaDecay);
  const warmRefreshTicks = estimateCoolingTicks(0.22, localCooling.alphaMin, localCooling.alphaDecay);
  const oldWarmRefreshTicks = estimateCoolingTicks(0.22, globalCooling.alphaMin, globalCooling.alphaDecay);

  assert.ok(rootChangeTicks < 60);
  assert.ok(warmRefreshTicks >= 30);
  assert.ok(warmRefreshTicks <= 60);
  assert.ok(oldWarmRefreshTicks > 200);
  assert.ok(warmRefreshTicks < oldWarmRefreshTicks / 4);
});

test('spatial index queries padded viewports and crossing links', async () => {
  const {
    buildSpatialIndex,
    getPaddedViewportWorldBounds,
    isLinkInBounds,
    querySpatialIndex
  } = await importSourceModule('src/components/graph/spatialIndex.ts');
  const inside = { id: 'inside', label: 'Inside', x: 10, y: 10 };
  const buffered = { id: 'buffered', label: 'Buffered', x: -50, y: 20 };
  const outside = { id: 'outside', label: 'Outside', x: 500, y: 500 };
  const index = buildSpatialIndex([inside, buffered, outside], 50);
  const bounds = getPaddedViewportWorldBounds(100, 100, { x: 0, y: 0, scale: 1 }, 80);

  assert.deepEqual(
    querySpatialIndex(index, bounds).map(node => node.id).sort(),
    ['buffered', 'inside']
  );
  assert.equal(
    isLinkInBounds(
      { source: { id: 'left', label: 'Left', x: -100, y: 50 }, target: { id: 'right', label: 'Right', x: 200, y: 50 } },
      { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    ),
    true
  );
  assert.equal(
    isLinkInBounds(
      { source: inside, target: outside },
      { minX: 0, maxX: 20, minY: 0, maxY: 20 }
    ),
    true
  );
  assert.equal(
    isLinkInBounds(
      { source: { id: 'far-left', label: 'Far Left', x: -300, y: 40 }, target: { id: 'left', label: 'Left', x: -200, y: 80 } },
      { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    ),
    false
  );
  assert.equal(
    isLinkInBounds(
      { source: { id: 'bad', label: 'Bad', x: Number.NaN, y: 40 }, target: inside },
      { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    ),
    false
  );
});

test('render loop spatial index refresh decision skips stable animation frames', async () => {
  const {
    isGraphSimulationActiveForFrame,
    shouldRefreshSpatialIndexForFrame
  } = await importSourceModule('src/components/graph/useGraphRenderLoop.ts');
  const nodes = [{ id: 'a', label: 'A', x: 0, y: 0 }];
  const nextNodes = [...nodes];
  const activeSimulation = {
    alpha: () => 0.2,
    alphaMin: () => 0.001
  };
  const cooledSimulation = {
    alpha: () => 0.001,
    alphaMin: () => 0.001
  };

  assert.equal(isGraphSimulationActiveForFrame(activeSimulation, false), true);
  assert.equal(isGraphSimulationActiveForFrame(activeSimulation, true), false);
  assert.equal(isGraphSimulationActiveForFrame(cooledSimulation, false), false);
  assert.equal(isGraphSimulationActiveForFrame(null, false), false);
  assert.equal(shouldRefreshSpatialIndexForFrame(null, nodes, false, false), true);
  assert.equal(shouldRefreshSpatialIndexForFrame(nodes, nodes, false, false), false);
  assert.equal(shouldRefreshSpatialIndexForFrame(nodes, nodes, true, false), true);
  assert.equal(shouldRefreshSpatialIndexForFrame(nodes, nodes, false, true), true);
  assert.equal(shouldRefreshSpatialIndexForFrame(nodes, nextNodes, false, false), true);
});

test('spatial index rejects non-finite or inverted query bounds', async () => {
  const {
    buildSpatialIndex,
    getPaddedViewportWorldBounds,
    querySpatialIndex
  } = await importSourceModule('src/components/graph/spatialIndex.ts');
  const indexedNode = { id: 'inside', label: 'Inside', x: 10, y: 10 };
  const invalidNode = { id: 'invalid', label: 'Invalid', x: Number.NaN, y: 0 };
  const index = buildSpatialIndex([indexedNode, invalidNode], 0);

  assert.equal(index.cellSize, 96);
  assert.deepEqual(querySpatialIndex(index, { minX: 0, maxX: 20, minY: 0, maxY: 20 }).map(node => node.id), ['inside']);
  assert.deepEqual(querySpatialIndex(index, { minX: -Infinity, maxX: Infinity, minY: 0, maxY: 20 }), []);
  assert.deepEqual(querySpatialIndex(index, { minX: 20, maxX: 0, minY: 0, maxY: 20 }), []);

  const invalidScaleBounds = getPaddedViewportWorldBounds(100, 100, { x: 0, y: 0, scale: 0 });
  assert.deepEqual(querySpatialIndex(index, invalidScaleBounds), []);
});

test('generateMockGraphData is deterministic and writes final node degrees', async () => {
  const { generateMockGraphData } = await importSourceModule('src/components/graph/debug/generateMockGraphData.ts');
  const first = generateMockGraphData(100, 3.5, 42);
  const second = generateMockGraphData(100, 3.5, 42);

  assert.deepEqual(second, first);

  const degreeById = new Map(first.nodes.map(node => [node.id, 0]));
  for (const link of first.links) {
    degreeById.set(link.source, (degreeById.get(link.source) || 0) + 1);
    degreeById.set(link.target, (degreeById.get(link.target) || 0) + 1);
  }

  for (const node of first.nodes) {
    assert.equal(node.degree, degreeById.get(node.id) || 0);
  }
});

test('debug harness scope transitions do not keep stale selected nodes', async () => {
  const {
    applyDebugModeChange,
    applyDebugRootFocus
  } = await importSourceModule('src/components/graph/debug/useDebugGraphState.ts');

  const selectedState = {
    mode: 'global',
    rootNodeId: 'node-a',
    selectedNodeId: 'node-b'
  };

  assert.deepEqual(applyDebugRootFocus(selectedState, 'node-c'), {
    mode: 'global',
    rootNodeId: 'node-c',
    selectedNodeId: null
  });

  assert.deepEqual(applyDebugModeChange({ ...selectedState, mode: 'local' }, 'local'), {
    mode: 'local',
    rootNodeId: 'node-a',
    selectedNodeId: 'node-b'
  });

  assert.deepEqual(applyDebugModeChange({ ...selectedState, mode: 'local' }, 'global'), {
    mode: 'global',
    rootNodeId: 'node-a',
    selectedNodeId: null
  });
});

test('local simulation gravity can preserve sparse scope centroid', async () => {
  const { resolveSimulationGravityCenter } = await importSourceModule('src/components/graph/useGraphSimulation.ts');

  const sparseScope = [
    { id: 'root', label: 'Root', x: 180, y: -90 },
    { id: 'leaf', label: 'Leaf', x: 220, y: -30 }
  ];

  assert.deepEqual(resolveSimulationGravityCenter(sparseScope, false), { x: 0, y: 0 });
  assert.deepEqual(resolveSimulationGravityCenter([{ id: 'root', label: 'Root', x: 180, y: -90 }], true), {
    x: 180,
    y: -90
  });
  assert.deepEqual(resolveSimulationGravityCenter(sparseScope, true), { x: 200, y: -60 });
  assert.deepEqual(resolveSimulationGravityCenter([{ id: 'bad', label: 'Bad', x: Number.NaN, y: 4 }], true), {
    x: 0,
    y: 0
  });
});

test('viewport fitting ignores invalid coordinates and rejects invalid dimensions', async () => {
  const {
    resolveViewportForGraphNode,
    resolveViewportForGraphNodes
  } = await importSourceModule('src/components/graph/useViewportControls.ts');
  const viewport = resolveViewportForGraphNodes(
    [
      { id: 'origin', label: 'Origin' },
      { id: 'bad', label: 'Bad', x: Number.NaN, y: 40 },
      { id: 'right', label: 'Right', x: 100, y: 0 }
    ],
    { width: 400, height: 300 },
    Number.NaN
  );

  assert.deepEqual(viewport, { x: 150, y: 150, scale: 1 });
  assert.equal(resolveViewportForGraphNodes([], { width: 400, height: 300 }), null);
  assert.equal(resolveViewportForGraphNodes([{ id: 'bad', label: 'Bad', x: Number.NaN, y: 0 }], { width: 400, height: 300 }), null);
  assert.equal(resolveViewportForGraphNodes([{ id: 'a', label: 'A' }], { width: 400, height: 0 }), null);

  const currentViewport = { x: 10, y: 20, scale: 2 };
  assert.deepEqual(
    resolveViewportForGraphNode(
      { id: 'focus', label: 'Focus', x: 20, y: -10 },
      { width: 400, height: 300 },
      currentViewport
    ),
    { x: 160, y: 170, scale: 2 }
  );
  assert.deepEqual(
    resolveViewportForGraphNode(
      { id: 'focus', label: 'Focus', x: 20, y: -10 },
      { width: 400, height: 300 },
      currentViewport,
      { minScale: 3 }
    ),
    { x: 140, y: 180, scale: 3 }
  );
  assert.deepEqual(
    resolveViewportForGraphNode(
      { id: 'focus', label: 'Focus' },
      { width: 400, height: 300 },
      currentViewport,
      { scale: 4 }
    ),
    { x: 200, y: 150, scale: 4 }
  );
  assert.equal(resolveViewportForGraphNode({ id: 'bad', label: 'Bad', x: Number.NaN, y: 0 }, { width: 400, height: 300 }, currentViewport), null);
  assert.equal(resolveViewportForGraphNode({ id: 'focus', label: 'Focus' }, { width: 0, height: 300 }, currentViewport), null);
  assert.equal(resolveViewportForGraphNode({ id: 'focus', label: 'Focus' }, { width: 400, height: 300 }, { x: 0, y: 0, scale: Number.NaN }), null);
  assert.equal(resolveViewportForGraphNode({ id: 'focus', label: 'Focus' }, { width: 400, height: 300 }, currentViewport, { scale: -1 }), null);
});

test('canvas backing size clamps invalid dimensions and device pixel ratio', async () => {
  const { resolveCanvasBackingSize } = await importSourceModule('src/components/graph/useCanvasSize.ts');

  assert.deepEqual(resolveCanvasBackingSize(320, 180, 2), {
    cssWidth: 320,
    cssHeight: 180,
    pixelWidth: 640,
    pixelHeight: 360,
    dpr: 2
  });
  assert.deepEqual(resolveCanvasBackingSize(0, 0, 2), {
    cssWidth: 0,
    cssHeight: 0,
    pixelWidth: 1,
    pixelHeight: 1,
    dpr: 2
  });
  assert.deepEqual(resolveCanvasBackingSize(Number.NaN, -10, Number.NaN), {
    cssWidth: 0,
    cssHeight: 0,
    pixelWidth: 1,
    pixelHeight: 1,
    dpr: 1
  });
});

test('anchored zoom helpers preserve pointer world position and reject invalid inputs', async () => {
  const {
    clampGraphZoomScale,
    resolveAnchoredZoomViewport,
    resolveWheelZoomViewport
  } = await importSourceModule('src/components/graph/useGraphPointerInteractions.ts');

  assert.equal(clampGraphZoomScale(0.01), 0.02);
  assert.equal(clampGraphZoomScale(40), 32);
  assert.equal(clampGraphZoomScale(Number.NaN), null);

  const viewport = { x: 100, y: 50, scale: 2 };
  const originX = 180;
  const originY = 130;
  const worldBefore = {
    x: (originX - viewport.x) / viewport.scale,
    y: (originY - viewport.y) / viewport.scale
  };
  const zoomed = resolveAnchoredZoomViewport(originX, originY, viewport, 4);

  assert.deepEqual(zoomed, { x: 20, y: -30, scale: 4 });
  assert.equal((originX - zoomed.x) / zoomed.scale, worldBefore.x);
  assert.equal((originY - zoomed.y) / zoomed.scale, worldBefore.y);

  const wheelZoomed = resolveWheelZoomViewport(originX, originY, viewport, -1);
  assert.equal(wheelZoomed.scale, 2.14);
  assert.equal((originX - wheelZoomed.x) / wheelZoomed.scale, worldBefore.x);
  assert.equal((originY - wheelZoomed.y) / wheelZoomed.scale, worldBefore.y);
  assert.equal(resolveAnchoredZoomViewport(originX, originY, { ...viewport, scale: 0 }, 3), null);
  assert.equal(resolveAnchoredZoomViewport(Number.POSITIVE_INFINITY, originY, viewport, 3), null);
});
