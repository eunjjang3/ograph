import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const repoRoot = new URL('../', import.meta.url);
const moduleCache = new Map();

async function importSourceModule(relativePath) {
  const sourcePath = fileURLToPath(new URL(relativePath, repoRoot));
  const cached = moduleCache.get(sourcePath);
  if (cached) return cached;

  const result = await esbuild.build({
    entryPoints: [sourcePath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false
  });
  const code = result.outputFiles[0].text;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  const loaded = await import(moduleUrl);
  moduleCache.set(sourcePath, loaded);
  return loaded;
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

  assert.equal(indexes.nodeById.get('a'), nodes[0]);
  assert.equal(indexes.degreeById.get('b'), 2);
  assert.deepEqual([...getFocusedNeighborSet('b', indexes.adjacencyById)].sort(), ['a', 'c']);
  assert.deepEqual([...getFocusedNeighborSet(null, indexes.adjacencyById)], []);
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
  assert.equal(resolveLabelVisibilityTarget(0, 1, 0.5, true), 1);
  assert.equal(resolveLabelVisibilityTarget(0, 0.1, 0, false), 0);
  assert.ok(resolveLabelVisibilityTarget(10, 1, 0.5, false) > 0);
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
  const { resolveViewportForGraphNodes } = await importSourceModule('src/components/graph/useViewportControls.ts');
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
