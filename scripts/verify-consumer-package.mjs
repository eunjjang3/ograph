import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = mkdtempSync(join(tmpdir(), 'ograph-consumer-verify-'));
const keepFixtures = process.env.OGRAPH_KEEP_CONSUMER_FIXTURES === '1';

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    env: process.env
  });
}

function writeConsumerFixture(consumerDir) {
  mkdirSync(consumerDir, { recursive: true });

  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`
  );

  writeFileSync(
    join(consumerDir, 'consumer.tsx'),
    `import { createRef } from 'react';
import {
  GraphView,
  type GraphLink,
  type GraphNode,
  type GraphViewRef
} from '@eunjjang/ograph';

type NoteMetadata = {
  slug: string;
};

const nodes: GraphNode<NoteMetadata>[] = [
  { id: 'note-a', label: 'Note A', metadata: { slug: 'note-a' } }
];
const links: GraphLink<{ relation: string }, NoteMetadata>[] = [];
const graphRef = createRef<GraphViewRef>();

const element = (
  <GraphView
    ref={graphRef}
    nodes={nodes}
    links={links}
    onNodeClick={(node) => node.metadata?.slug.toUpperCase()}
  />
);

graphRef.current?.fitToView();
void element;
`
  );

  writeFileSync(
    join(consumerDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          allowSyntheticDefaultImports: false,
          esModuleInterop: false,
          jsx: 'react-jsx',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: 'ES2020'
        },
        include: ['consumer.tsx']
      },
      null,
      2
    )}\n`
  );
}

function verifyReactConsumer(tarballPath, reactMajor) {
  const consumerDir = join(workspace, `react-${reactMajor}`);
  writeConsumerFixture(consumerDir);

  run(
    'npm',
    [
      'install',
      '--silent',
      tarballPath,
      `react@${reactMajor}`,
      `react-dom@${reactMajor}`,
      `@types/react@${reactMajor}`,
      `@types/react-dom@${reactMajor}`,
      'typescript@5'
    ],
    { cwd: consumerDir }
  );

  run(
    'node',
    [
      '--input-type=module',
      '-e',
      "import { GraphView, defaultGraphPreset, defaultGraphTheme } from '@eunjjang/ograph'; if (!GraphView) throw new Error('GraphView export missing'); if (!defaultGraphPreset.nodeRadius) throw new Error('preset missing'); if (!defaultGraphTheme.backgroundColor) throw new Error('theme missing');"
    ],
    { cwd: consumerDir }
  );

  run('npx', ['tsc', '--project', 'tsconfig.json'], { cwd: consumerDir });
  console.log(`React ${reactMajor} packed consumer verification passed.`);
}

try {
  const packDir = join(workspace, 'pack');
  mkdirSync(packDir, { recursive: true });
  run('npm', ['pack', '--pack-destination', packDir]);
  const tarballs = readdirSync(packDir).filter(file => file.endsWith('.tgz'));

  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball, found ${tarballs.length}.`);
  }

  const tarballPath = join(packDir, tarballs[0]);
  verifyReactConsumer(tarballPath, 18);
  verifyReactConsumer(tarballPath, 19);
} catch (error) {
  console.error(`Packed consumer verification failed. Fixture root: ${workspace}`);
  throw error;
} finally {
  if (!keepFixtures) {
    rmSync(workspace, { recursive: true, force: true });
  }
}
