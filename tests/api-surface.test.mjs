import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('built package exposes only the expected runtime exports', async () => {
  const publicModule = await import(new URL('../dist/index.js', import.meta.url).href);
  const runtimeExports = Object.keys(publicModule).sort();

  assert.deepEqual(runtimeExports, [
    'GraphView',
    'defaultGraphPreset',
    'defaultGraphTheme'
  ]);
});

test('built package entry preserves the Next.js client directive', async () => {
  const runtimeEntry = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');

  assert.match(runtimeEntry, /^"use client";\n/);
});

test('built type entry preserves the public type surface without internal helpers', async () => {
  const typeEntry = await readFile(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  const expectedTypeNames = [
    'GraphCameraFocusOptions',
    'GraphGrowthAnimationOptions',
    'GraphGrowthTimestamp',
    'GraphLink',
    'GraphNode',
    'GraphNodeMetadata',
    'GraphNodeType',
    'GraphPreset',
    'GraphTheme',
    'GraphViewMode',
    'GraphViewProps',
    'GraphViewport',
    'GraphViewRef'
  ];

  for (const typeName of expectedTypeNames) {
    assert.match(typeEntry, new RegExp(`\\b${typeName}\\b`));
  }

  assert.doesNotMatch(typeEntry, /\bGraphErrorBoundary\b/);
  assert.doesNotMatch(typeEntry, /\bsanitizeNodes\b/);
  assert.doesNotMatch(typeEntry, /\bsanitizeLinks\b/);
  assert.doesNotMatch(typeEntry, /\bsanitizeLocalDepth\b/);
  assert.doesNotMatch(typeEntry, /\bnormalizeGraphInput\b/);
  assert.doesNotMatch(typeEntry, /\bNormalizedGraphInput\b/);
  assert.doesNotMatch(typeEntry, /\bdiffGraph\b/);
  assert.doesNotMatch(typeEntry, /\bGraphPatch\b/);
});

test('built declarations preserve consumer metadata through GraphView callbacks', async () => {
  const typeEntry = await readFile(new URL('../dist/types.d.ts', import.meta.url), 'utf8');
  const graphViewEntry = await readFile(new URL('../dist/GraphView.d.ts', import.meta.url), 'utf8');

  assert.match(
    typeEntry,
    /interface GraphViewProps<\s*NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,\s*LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata\s*>/
  );
  assert.match(typeEntry, /nodes: GraphNode<NodeMetadata>\[\];/);
  assert.match(typeEntry, /links: GraphLink<LinkMetadata, NodeMetadata>\[\];/);
  assert.match(typeEntry, /onNodeClick\?: \(node: GraphNode<NodeMetadata>\) => void;/);
  assert.match(typeEntry, /onNodeHover\?: \(node: GraphNode<NodeMetadata> \| null\) => void;/);
  assert.match(typeEntry, /growthAnimation\?: boolean \| GraphGrowthAnimationOptions<NodeMetadata>;/);
  assert.match(typeEntry, /cameraFocusNodeId\?: string \| null;/);
  assert.match(typeEntry, /cameraFocusOptions\?: GraphCameraFocusOptions;/);
  assert.match(typeEntry, /ariaLabel\?: string;/);
  assert.match(typeEntry, /canvasRole\?: AriaRole;/);
  assert.match(graphViewEntry, /focusCameraOnNode: \(nodeId: string, options\?: GraphCameraFocusOptions\) => boolean;/);
  assert.match(
    graphViewEntry,
    /GraphViewProps<NodeMetadata, LinkMetadata> & React\.RefAttributes<GraphViewRef>/
  );
});

test('package metadata publishes public scoped tarballs with referenced docs', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(packageJson.publishConfig?.access, 'public');
  assert.equal(packageJson.repository?.url, 'git+https://github.com/eunjjang3/ograph.git');
  assert.equal(packageJson.homepage, 'https://github.com/eunjjang3/ograph#readme');
  assert.equal(packageJson.bugs?.url, 'https://github.com/eunjjang3/ograph/issues');

  for (const includedFile of [
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'docs/api.md',
    'docs/architecture.md',
    'docs/debug-harness.md'
  ]) {
    assert.ok(
      packageJson.files.includes(includedFile),
      `package files should include ${includedFile}`
    );
  }

  for (const internalFile of [
    'docs/**/*.md',
    'docs/hardening-roadmap.md',
    'docs/internal-notes.md',
    'docs/refactor-notes.md',
    'docs/release-checklist.md'
  ]) {
    assert.ok(
      !packageJson.files.includes(internalFile),
      `package files should not include internal docs entry ${internalFile}`
    );
  }
});

test('debug harness displays the package version injected by Vite', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const debugPanel = await readFile(
    new URL('../src/components/graph/debug/DebugControlPanel.tsx', import.meta.url),
    'utf8'
  );
  const fallbackVersion = debugPanel.match(/VITE_OGRAPH_VERSION \?\? '([^']+)'/)?.[1];

  assert.match(viteConfig, /VITE_OGRAPH_VERSION/);
  assert.match(debugPanel, /VITE_OGRAPH_VERSION/);
  assert.match(debugPanel, /v\{debugSuiteVersion\}/);
  assert.equal(fallbackVersion, packageJson.version);
  assert.doesNotMatch(debugPanel, /\bv1\.1\b/);
});

test('published package copy stays app-agnostic', async () => {
  const publishedTextFiles = [
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'docs/api.md',
    'docs/architecture.md',
    'docs/debug-harness.md'
  ];

  for (const filePath of publishedTextFiles) {
    const contents = await readFile(new URL(`../${filePath}`, import.meta.url), 'utf8');

    assert.doesNotMatch(
      contents,
      /\bnote\s+CRUD\b|\bapp-specific\s+consumption\b/i,
      `${filePath} should not describe Ograph as an app-specific note package`
    );
  }
});
