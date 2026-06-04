import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pinnedFixtureRoot = join(repoRoot, 'tests/fixtures/packed-consumer');
const workspace = mkdtempSync(join(tmpdir(), 'ograph-consumer-verify-'));
const keepFixtures = process.env.OGRAPH_KEEP_CONSUMER_FIXTURES === '1';
const validLanes = new Set(['all', 'pinned', 'floating']);

function parseLane(args) {
  let lane = 'all';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--lane') {
      lane = args[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('--lane=')) {
      lane = arg.slice('--lane='.length);
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (!validLanes.has(lane)) {
    throw new Error(`Expected --lane to be one of ${Array.from(validLanes).join(', ')}, got ${lane}.`);
  }

  return lane;
}

const lane = parseLane(process.argv.slice(2));

const floatingConsumers = [
  {
    label: 'React 18 floating compatibility',
    slug: 'react-18-floating',
    installSpecs: ['react@18', 'react-dom@18', '@types/react@18', '@types/react-dom@18', 'typescript@5']
  },
  {
    label: 'React 19 floating compatibility',
    slug: 'react-19-floating',
    installSpecs: ['react@19', 'react-dom@19', '@types/react@19', '@types/react-dom@19', 'typescript@5']
  }
];

const pinnedConsumers = [
  {
    label: 'React 18 lock-pinned baseline',
    slug: 'react-18-pinned',
    fixture: 'react-18'
  },
  {
    label: 'React 19 lock-pinned baseline',
    slug: 'react-19-pinned',
    fixture: 'react-19'
  }
];

function getConsumersForLane(targetLane) {
  if (targetLane === 'pinned') return pinnedConsumers;
  if (targetLane === 'floating') return floatingConsumers;
  return [...pinnedConsumers, ...floatingConsumers];
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    env: process.env
  });
}

function writeConsumerSourceFixture(consumerDir) {
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

function prepareFloatingConsumer(consumerDir, installSpecs, tarballPath) {
  mkdirSync(consumerDir, { recursive: true });

  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`
  );

  writeConsumerSourceFixture(consumerDir);

  run(
    'npm',
    [
      'install',
      '--silent',
      tarballPath,
      ...installSpecs
    ],
    { cwd: consumerDir }
  );
}

function preparePinnedConsumer(consumerDir, fixture, tarballPath) {
  cpSync(join(pinnedFixtureRoot, fixture), consumerDir, { recursive: true });
  writeConsumerSourceFixture(consumerDir);
  run('npm', ['ci', '--silent'], { cwd: consumerDir });
  run('npm', ['install', '--silent', '--no-save', '--package-lock=false', tarballPath], {
    cwd: consumerDir
  });
}

function verifyReactConsumer(tarballPath, consumer) {
  const consumerDir = join(workspace, consumer.slug);

  if (consumer.fixture) {
    preparePinnedConsumer(consumerDir, consumer.fixture, tarballPath);
  } else {
    prepareFloatingConsumer(consumerDir, consumer.installSpecs, tarballPath);
  }

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
  console.log(`${consumer.label} packed consumer verification passed.`);
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
  for (const consumer of getConsumersForLane(lane)) {
    verifyReactConsumer(tarballPath, consumer);
  }
} catch (error) {
  console.error(`Packed consumer verification failed. Fixture root: ${workspace}`);
  throw error;
} finally {
  if (!keepFixtures) {
    rmSync(workspace, { recursive: true, force: true });
  }
}
