import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = join(repoRoot, '.tmp');
const fixtureRoot = join(tempRoot, 'browser-consumer');
const packDir = join(tempRoot, 'browser-pack');

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    env: process.env
  });
}

function readRootPackage() {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path, value) {
  writeFileSync(path, value);
}

export function prepareBrowserConsumerFixture() {
  const rootPackage = readRootPackage();

  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });
  mkdirSync(join(fixtureRoot, 'src'), { recursive: true });

  run('npm', ['pack', '--pack-destination', packDir]);

  const tarballs = readdirSync(packDir).filter(file => file.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball, found ${tarballs.length}.`);
  }

  const tarballPath = join(packDir, tarballs[0]);
  const tarballSpecifier = `file:${relative(fixtureRoot, tarballPath)}`;

  writeJson(join(fixtureRoot, 'package.json'), {
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc --noEmit && vite build'
    },
    dependencies: {
      '@afterglow/ograph': tarballSpecifier,
      '@vitejs/plugin-react': rootPackage.devDependencies['@vitejs/plugin-react'],
      vite: rootPackage.devDependencies.vite,
      typescript: rootPackage.devDependencies.typescript,
      react: rootPackage.devDependencies.react,
      'react-dom': rootPackage.devDependencies['react-dom']
    },
    devDependencies: {}
  });

  writeJson(join(fixtureRoot, 'tsconfig.json'), {
    compilerOptions: {
      jsx: 'react-jsx',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: 'ES2020'
    },
    include: ['src']
  });

  writeText(
    join(fixtureRoot, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()]
});
`
  );

  writeText(
    join(fixtureRoot, 'index.html'),
    `<div id="root"></div><script type="module" src="/src/main.tsx"></script>
`
  );

  writeText(
    join(fixtureRoot, 'src/styles.css'),
    `:root {
  color: #f8fafc;
  background: #111318;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button {
  border: 1px solid #334155;
  border-radius: 4px;
  background: #1f2937;
  color: #f8fafc;
  cursor: pointer;
  font: inherit;
  padding: 6px 10px;
}

button:focus-visible {
  outline: 2px solid #38bdf8;
  outline-offset: 2px;
}

.app {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.toolbar,
.status {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.graph-shell {
  border: 1px solid #334155;
  height: 520px;
  width: 760px;
}

.status span {
  color: #cbd5e1;
  font-size: 12px;
}
`
  );

  writeText(
    join(fixtureRoot, 'src/main.tsx'),
    `import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  GraphView,
  type GraphLink,
  type GraphNode,
  type GraphViewRef,
  type GraphViewport
} from '@afterglow/ograph';
import './styles.css';

type FixtureName = 'empty' | 'single' | 'small' | 'medium' | 'invalid' | 'local';

type EventState = {
  click: string;
  doubleClick: string;
  hover: string;
  dragStart: string;
  dragEnd: string;
  dragCount: number;
  viewportCount: number;
  viewportScale: number;
  errors: string[];
};

const emptyEvents: EventState = {
  click: 'none',
  doubleClick: 'none',
  hover: 'none',
  dragStart: 'none',
  dragEnd: 'none',
  dragCount: 0,
  viewportCount: 0,
  viewportScale: 1,
  errors: []
};

function makeMediumGraph(): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  for (let index = 0; index < 500; index += 1) {
    const column = index % 25;
    const row = Math.floor(index / 25);
    nodes.push({
      id: \`node-\${index}\`,
      label: \`Node \${index}\`,
      type: index % 17 === 0 ? 'hub' : index % 5 === 0 ? 'tag' : 'domain',
      x: (column - 12) * 34,
      y: (row - 10) * 34,
      size: index % 17 === 0 ? 1.8 : 1
    });
  }

  for (let index = 0; index < 500; index += 1) {
    links.push({ source: \`node-\${index}\`, target: \`node-\${(index + 1) % 500}\` });
    links.push({ source: \`node-\${index}\`, target: \`node-\${(index + 37) % 500}\` });
  }

  return { nodes, links };
}

function getFixture(name: FixtureName): { nodes: GraphNode[]; links: GraphLink[]; rootNodeId?: string | null } {
  if (name === 'empty') {
    return { nodes: [], links: [] };
  }

  if (name === 'single') {
    return {
      nodes: [
        { id: 'center', label: 'Center', type: 'hub', x: 0, y: 0, size: 2.6 }
      ],
      links: []
    };
  }

  if (name === 'medium') {
    return makeMediumGraph();
  }

  if (name === 'invalid') {
    return {
      nodes: [
        { id: 'valid-a', label: 'Valid A', type: 'hub', x: Number.NaN, y: Number.POSITIVE_INFINITY },
        { id: 'valid-b', label: 'Valid B', type: 'tag', x: 90, y: 0 },
        { id: 'valid-c', label: 'Valid C', type: 'domain', x: -90, y: 0 }
      ],
      links: [
        { source: 'valid-a', target: 'valid-b' },
        { source: 'valid-a', target: 'missing' },
        { source: 'valid-c', target: 'valid-c' }
      ]
    };
  }

  const nodes: GraphNode[] = [
    { id: 'root', label: 'Root', type: 'hub', x: 0, y: 0, size: 2 },
    { id: 'neighbor-a', label: 'Neighbor A', type: 'tag', x: 90, y: -40 },
    { id: 'neighbor-b', label: 'Neighbor B', type: 'domain', x: -90, y: 40 },
    { id: 'outside', label: 'Outside', type: 'attachment', x: 240, y: 160 }
  ];
  const links: GraphLink[] = [
    { source: 'root', target: 'neighbor-a' },
    { source: 'root', target: 'neighbor-b' },
    { source: 'outside', target: 'neighbor-a' }
  ];

  if (name === 'local') {
    return { nodes, links, rootNodeId: 'root' };
  }

  return { nodes, links };
}

function App() {
  const graphRef = useRef<GraphViewRef | null>(null);
  const [fixtureName, setFixtureName] = useState<FixtureName>('small');
  const [mode, setMode] = useState<'global' | 'local'>('global');
  const [events, setEvents] = useState<EventState>(emptyEvents);
  const fixture = useMemo(() => getFixture(fixtureName), [fixtureName]);
  const rootNodeId = mode === 'local' ? fixture.rootNodeId ?? fixture.nodes[0]?.id ?? null : null;
  const paused = fixtureName === 'single';

  useEffect(() => {
    setEvents(emptyEvents);
    const fitTimer = window.setTimeout(() => {
      graphRef.current?.fitToView();
    }, 150);

    return () => {
      window.clearTimeout(fitTimer);
    };
  }, [fixtureName, mode]);

  const patchEvents = (patch: Partial<EventState>) => {
    setEvents(current => ({ ...current, ...patch }));
  };

  return (
    <main className="app">
      <div className="toolbar">
        <button data-testid="fixture-empty" onClick={() => setFixtureName('empty')}>Empty</button>
        <button data-testid="fixture-single" onClick={() => setFixtureName('single')}>Single</button>
        <button data-testid="fixture-medium" onClick={() => setFixtureName('medium')}>Medium</button>
        <button data-testid="fixture-invalid" onClick={() => setFixtureName('invalid')}>Invalid</button>
        <button data-testid="fixture-local" onClick={() => setFixtureName('local')}>Local Fixture</button>
        <button data-testid="mode-global" onClick={() => setMode('global')}>Global</button>
        <button data-testid="mode-local" onClick={() => setMode('local')}>Local</button>
        <button data-testid="fit" onClick={() => graphRef.current?.fitToView()}>Fit</button>
        <button data-testid="reset" onClick={() => graphRef.current?.resetViewport()}>Reset</button>
      </div>

      <div className="graph-shell">
        <GraphView
          ref={graphRef}
          nodes={fixture.nodes}
          links={fixture.links}
          mode={mode}
          rootNodeId={rootNodeId}
          localDepth={1}
          paused={paused}
          ariaLabel="Packed browser graph"
          canvasRole="img"
          onNodeClick={(node) => patchEvents({ click: node.id })}
          onNodeDoubleClick={(node) => patchEvents({ doubleClick: node.id })}
          onNodeHover={(node) => patchEvents({ hover: node?.id ?? 'none' })}
          onNodeDragStart={(node) => patchEvents({ dragStart: node.id })}
          onNodeDrag={() => setEvents(current => ({ ...current, dragCount: current.dragCount + 1 }))}
          onNodeDragEnd={(node) => patchEvents({ dragEnd: node.id })}
          onViewportChange={(viewport: GraphViewport) => setEvents(current => ({
            ...current,
            viewportCount: current.viewportCount + 1,
            viewportScale: viewport.scale
          }))}
          onError={(error) => setEvents(current => ({
            ...current,
            errors: [...current.errors, error.message]
          }))}
        />
      </div>

      <div className="status">
        <span data-testid="fixture-name">{fixtureName}</span>
        <span data-testid="mode-name">{mode}</span>
        <span data-testid="event-click">{events.click}</span>
        <span data-testid="event-double-click">{events.doubleClick}</span>
        <span data-testid="event-hover">{events.hover}</span>
        <span data-testid="event-drag-start">{events.dragStart}</span>
        <span data-testid="event-drag-end">{events.dragEnd}</span>
        <span data-testid="event-drag-count">{events.dragCount}</span>
        <span data-testid="event-viewport-count">{events.viewportCount}</span>
        <span data-testid="event-viewport-scale">{events.viewportScale.toFixed(3)}</span>
        <span data-testid="event-errors">{events.errors.join('|') || 'none'}</span>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`
  );

  run('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: fixtureRoot });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepareBrowserConsumerFixture();
}
