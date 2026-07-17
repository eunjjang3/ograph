import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const repoRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const moduleCache = new Map();
const BUDGETS = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/package-budgets.json'), 'utf8'));
const BUDGET_MEASUREMENT_BATCHES = 3;
const BUDGET_SAMPLE_RUNS = 9;
const BUDGET_WARMUP_RUNS = 3;

async function importSourceModule(relativePath) {
  const sourcePath = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
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

function createGraphFixture(nodeCount, edgeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    label: `Node ${index}`,
    x: (index % 50) * 16,
    y: Math.floor(index / 50) * 16,
    metadata: { index }
  }));
  const links = [];

  for (let index = 0; index < edgeCount; index += 1) {
    const sourceIndex = index % nodeCount;
    let targetIndex = (index * 17 + 1) % nodeCount;
    if (targetIndex === sourceIndex) {
      targetIndex = (targetIndex + 1) % nodeCount;
    }

    links.push({
      id: `edge-${index}`,
      source: `node-${sourceIndex}`,
      target: `node-${targetIndex}`,
      metadata: { index }
    });
  }

  return { nodes, links, localDepth: 2 };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureMedianBatchMs(operation) {
  const durations = [];
  for (let index = 0; index < BUDGET_SAMPLE_RUNS; index += 1) {
    const start = performance.now();
    operation();
    durations.push(performance.now() - start);
  }

  return median(durations);
}

function measureBudgetMs(operation) {
  const batchMedians = [];

  for (let batch = 0; batch < BUDGET_MEASUREMENT_BATCHES; batch += 1) {
    for (let index = 0; index < BUDGET_WARMUP_RUNS; index += 1) {
      operation();
    }

    batchMedians.push(measureMedianBatchMs(operation));
  }

  return Math.min(...batchMedians);
}

function formatNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatPercent(ratio) {
  return formatNumber(ratio * 100);
}

function assertFiniteNumber(value, message) {
  assert.equal(typeof value, 'number', message);
  assert.ok(Number.isFinite(value), message);
}

function resolveBudgetLimit(key, budget) {
  assertFiniteNumber(budget.baseline, `${key} baseline must be numeric`);
  assert.equal(typeof budget.unit, 'string', `${key} unit must be a string`);

  if (typeof budget.max === 'number') {
    assert.ok(Number.isFinite(budget.max), `${key} max must be finite`);
    return {
      max: budget.max,
      policy: `fixed max ${formatNumber(budget.max)}${budget.unit}`
    };
  }

  assertFiniteNumber(
    budget.allowedRegressionRatio,
    `${key} allowedRegressionRatio must be numeric when max is omitted`
  );
  assert.ok(
    budget.allowedRegressionRatio >= 0,
    `${key} allowedRegressionRatio must be non-negative`
  );

  const minimumHeadroom = budget.minimumHeadroom ?? 0;
  assertFiniteNumber(minimumHeadroom, `${key} minimumHeadroom must be numeric`);
  assert.ok(minimumHeadroom >= 0, `${key} minimumHeadroom must be non-negative`);

  const ratioHeadroom = budget.baseline * budget.allowedRegressionRatio;
  const headroom = Math.max(ratioHeadroom, minimumHeadroom);
  const policySuffix = minimumHeadroom > 0
    ? ` with ${formatNumber(minimumHeadroom)}${budget.unit} floor`
    : '';

  return {
    max: budget.baseline + headroom,
    policy: `baseline + ${formatPercent(budget.allowedRegressionRatio)}%${policySuffix}`
  };
}

function assertBudget(key, label, actual) {
  const budget = BUDGETS[key];
  assert.ok(budget, `Missing package budget for ${key}`);

  const { baseline, unit } = budget;
  const { max, policy } = resolveBudgetLimit(key, budget);

  if (actual > max) {
    throw new Error(`${label} exceeded budget: ${actual.toFixed(2)}${unit} > ${formatNumber(max)}${unit}`);
  }

  console.log(
    `${label}: ${actual.toFixed(2)}${unit} / ${formatNumber(max)}${unit} (${policy}; baseline ${formatNumber(baseline)}${unit})`
  );
}

function gzipJavaScriptDirectory(relativeDirectory) {
  const directory = resolve(repoRoot, relativeDirectory);
  const files = readdirSync(directory)
    .filter(fileName => fileName.endsWith('.js'))
    .sort();

  assert.ok(files.length > 0, `${relativeDirectory} must contain JavaScript assets`);
  return files.reduce(
    (total, fileName) => total + gzipSync(readFileSync(resolve(directory, fileName))).byteLength,
    0
  );
}

const distIndex = readFileSync(resolve(repoRoot, 'dist/index.js'));
assertBudget(
  'distIndexGzipBytes',
  'dist/index.js gzip',
  gzipSync(distIndex).byteLength
);
assertBudget(
  'distLazyChunksGzipBytes',
  'dist/chunks/*.js aggregate gzip',
  gzipJavaScriptDirectory('dist/chunks')
);
assertBudget(
  'distWorkerGzipBytes',
  'dist/workers/*.js aggregate gzip',
  gzipJavaScriptDirectory('dist/workers')
);

const [
  { normalizeGraphInput },
  { diffGraph },
  { getGraphTopologySignature },
  { buildGraphIndexes },
  { buildSpatialIndex }
] = await Promise.all([
  importSourceModule('src/components/graph/inputValidation.ts'),
  importSourceModule('src/components/graph/graphDiff.ts'),
  importSourceModule('src/components/graph/useGraphSimulation.ts'),
  importSourceModule('src/components/graph/graphIndexes.ts'),
  importSourceModule('src/components/graph/spatialIndex.ts')
]);

const mediumGraph = createGraphFixture(500, 1000);
const normalizedMediumGraph = normalizeGraphInput(mediumGraph);
const updatedMediumGraph = {
  nodes: normalizedMediumGraph.nodes.map((node, index) => (
    index % 50 === 0
      ? { ...node, label: `${node.label} updated` }
      : node
  )),
  links: normalizedMediumGraph.links.map((link, index) => (
    index % 100 === 0
      ? { ...link, label: `updated-${index}` }
      : link
  ))
};

assert.equal(normalizedMediumGraph.nodes.length, 500);
assert.equal(normalizedMediumGraph.links.length, 1000);

assertBudget(
  'normalizeMediumMs',
  'normalize medium graph',
  measureBudgetMs(() => normalizeGraphInput(mediumGraph))
);

assertBudget(
  'diffMediumMs',
  'diff medium graph',
  measureBudgetMs(() => diffGraph(normalizedMediumGraph, updatedMediumGraph))
);

assertBudget(
  'topologyMediumMs',
  'topology medium graph',
  measureBudgetMs(() => getGraphTopologySignature(normalizedMediumGraph.nodes, normalizedMediumGraph.links))
);

assertBudget(
  'indexesMediumMs',
  'indexes medium graph',
  measureBudgetMs(() => buildGraphIndexes(normalizedMediumGraph.nodes, normalizedMediumGraph.links))
);

assertBudget(
  'spatialIndexMediumMs',
  'spatial index medium graph',
  measureBudgetMs(() => buildSpatialIndex(normalizedMediumGraph.nodes))
);

console.log('Package budgets passed.');
