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
      '@eunjjang/ograph': tarballSpecifier,
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
} from '@eunjjang/ograph';
import './styles.css';

type FixtureName =
  | 'empty'
  | 'single'
  | 'small'
  | 'medium'
  | 'dense'
  | 'disconnected'
  | 'invalid'
  | 'local';

const trackedWindowEventTypes = new Set([
  'mousemove',
  'mouseup',
  'pointercancel',
  'pointermove',
  'pointerup',
  'resize'
]);
const trackedWindowListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
const activeAnimationFrames = new Set<number>();
const originalAddEventListener = window.addEventListener.bind(window);
const originalRemoveEventListener = window.removeEventListener.bind(window);
const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);

window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
  if (trackedWindowEventTypes.has(type)) {
    const listeners = trackedWindowListeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    trackedWindowListeners.set(type, listeners);
  }
  originalAddEventListener(type, listener, options);
}) as typeof window.addEventListener;

window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
  trackedWindowListeners.get(type)?.delete(listener);
  originalRemoveEventListener(type, listener, options);
}) as typeof window.removeEventListener;

window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
  let frameId = 0;
  frameId = originalRequestAnimationFrame(timestamp => {
    activeAnimationFrames.delete(frameId);
    callback(timestamp);
  });
  activeAnimationFrames.add(frameId);
  return frameId;
}) as typeof window.requestAnimationFrame;

window.cancelAnimationFrame = ((frameId: number) => {
  activeAnimationFrames.delete(frameId);
  originalCancelAnimationFrame(frameId);
}) as typeof window.cancelAnimationFrame;

Object.assign(window, {
  __ographDiagnostics: {
    activeAnimationFrameCount: () => activeAnimationFrames.size,
    activeGraphListenerCount: () => Array.from(trackedWindowListeners.values())
      .reduce((count, listeners) => count + listeners.size, 0)
  }
});

type EventState = {
  click: string;
  doubleClick: string;
  hover: string;
  dragStart: string;
  dragStartCount: number;
  dragEnd: string;
  dragEndCount: number;
  dragCount: number;
  viewportCount: number;
  viewportX: number;
  viewportY: number;
  viewportScale: number;
  errors: string[];
};

const emptyEvents: EventState = {
  click: 'none',
  doubleClick: 'none',
  hover: 'none',
  dragStart: 'none',
  dragStartCount: 0,
  dragEnd: 'none',
  dragEndCount: 0,
  dragCount: 0,
  viewportCount: 0,
  viewportX: 0,
  viewportY: 0,
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

function makeDenseGraph(): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeCount = 360;
  const neighborOffsets = [1, 2, 5, 13, 29, 61];

  for (let index = 0; index < nodeCount; index += 1) {
    const angle = (index / nodeCount) * Math.PI * 2;
    const ring = 90 + (index % 12) * 12;
    nodes.push({
      id: \`dense-\${index}\`,
      label: '',
      type: index % 23 === 0 ? 'hub' : index % 7 === 0 ? 'tag' : 'domain',
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
      size: index % 23 === 0 ? 1.7 : 0.8
    });
  }

  for (let index = 0; index < nodeCount; index += 1) {
    for (const offset of neighborOffsets) {
      links.push({
        source: \`dense-\${index}\`,
        target: \`dense-\${(index + offset) % nodeCount}\`
      });
    }
  }

  return { nodes, links };
}

function makeDisconnectedGraph(): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [
    { id: 'left-a', label: 'Left A', type: 'hub', x: -180, y: -60 },
    { id: 'left-b', label: 'Left B', type: 'tag', x: -110, y: -100 },
    { id: 'left-c', label: 'Left C', type: 'domain', x: -110, y: -20 },
    { id: 'right-a', label: 'Right A', type: 'hub', x: 130, y: 30 },
    { id: 'right-b', label: 'Right B', type: 'tag', x: 200, y: -10 },
    { id: 'right-c', label: 'Right C', type: 'domain', x: 200, y: 70 },
    { id: 'isolated-a', label: 'Isolated A', type: 'attachment', x: -20, y: 150 },
    { id: 'isolated-b', label: 'Isolated B', type: 'attachment', x: 30, y: -150 }
  ];
  const links: GraphLink[] = [
    { source: 'left-a', target: 'left-b' },
    { source: 'left-a', target: 'left-c' },
    { source: 'right-a', target: 'right-b' },
    { source: 'right-a', target: 'right-c' }
  ];

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

  if (name === 'dense') {
    return makeDenseGraph();
  }

  if (name === 'disconnected') {
    return makeDisconnectedGraph();
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

  if (name === 'local') {
    return {
      nodes: [
        { id: 'local-root', label: 'Local Root', type: 'hub', x: 0, y: 0, size: 2 },
        { id: 'local-neighbor-a', label: 'Local Neighbor A', type: 'tag', x: 90, y: -40 },
        { id: 'local-neighbor-b', label: 'Local Neighbor B', type: 'domain', x: -90, y: 40 },
        { id: 'local-outside', label: 'Local Outside', type: 'attachment', x: 240, y: 160 }
      ],
      links: [
        { source: 'local-root', target: 'local-neighbor-a' },
        { source: 'local-root', target: 'local-neighbor-b' },
        { source: 'local-outside', target: 'local-neighbor-a' }
      ],
      rootNodeId: 'local-root'
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

  return { nodes, links };
}

function App() {
  const graphRef = useRef<GraphViewRef | null>(null);
  const [fixtureName, setFixtureName] = useState<FixtureName>('small');
  const [mode, setMode] = useState<'global' | 'local'>('global');
  const [events, setEvents] = useState<EventState>(emptyEvents);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphMounted, setGraphMounted] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const fixture = useMemo(() => getFixture(fixtureName), [fixtureName]);
  const rootNodeId = mode === 'local' ? fixture.rootNodeId ?? fixture.nodes[0]?.id ?? null : null;
  const graphPaused = paused || fixtureName === 'single';

  useEffect(() => {
    setEvents(current => ({ ...emptyEvents, errors: current.errors }));
    setSelectedNodeId(null);
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
        <button data-testid="fixture-small" onClick={() => setFixtureName('small')}>Small</button>
        <button data-testid="fixture-medium" onClick={() => setFixtureName('medium')}>Medium</button>
        <button data-testid="fixture-dense" onClick={() => setFixtureName('dense')}>Dense</button>
        <button data-testid="fixture-disconnected" onClick={() => setFixtureName('disconnected')}>Disconnected</button>
        <button data-testid="fixture-invalid" onClick={() => setFixtureName('invalid')}>Invalid</button>
        <button data-testid="fixture-local" onClick={() => setFixtureName('local')}>Local Fixture</button>
        <button data-testid="mode-global" onClick={() => setMode('global')}>Global</button>
        <button data-testid="mode-local" onClick={() => setMode('local')}>Local</button>
        <button data-testid="select-first" onClick={() => setSelectedNodeId(fixture.nodes[0]?.id ?? null)}>Select First</button>
        <button data-testid="toggle-pause" onClick={() => setPaused(current => !current)}>Toggle Pause</button>
        <button data-testid="toggle-size" onClick={() => setExpanded(current => !current)}>Toggle Size</button>
        <button data-testid="toggle-mount" onClick={() => setGraphMounted(current => !current)}>Toggle Mount</button>
        <button data-testid="fit" onClick={() => graphRef.current?.fitToView()}>Fit</button>
        <button data-testid="reset" onClick={() => graphRef.current?.resetViewport()}>Reset</button>
      </div>

      <div
        className="graph-shell"
        style={{ height: expanded ? 420 : 520, width: expanded ? 640 : 760 }}
      >
        {graphMounted && (
          <GraphView
            ref={graphRef}
            nodes={fixture.nodes}
            links={fixture.links}
            selectedNodeId={selectedNodeId}
            mode={mode}
            rootNodeId={rootNodeId}
            localDepth={1}
            paused={graphPaused}
            ariaLabel="Packed browser graph"
            canvasRole="img"
            onNodeClick={(node) => {
              setSelectedNodeId(node.id);
              patchEvents({ click: node.id });
            }}
            onNodeDoubleClick={(node) => patchEvents({ doubleClick: node.id })}
            onNodeHover={(node) => patchEvents({ hover: node?.id ?? 'none' })}
            onNodeDragStart={(node) => setEvents(current => ({
              ...current,
              dragStart: node.id,
              dragStartCount: current.dragStartCount + 1
            }))}
            onNodeDrag={() => setEvents(current => ({ ...current, dragCount: current.dragCount + 1 }))}
            onNodeDragEnd={(node) => setEvents(current => ({
              ...current,
              dragEnd: node.id,
              dragEndCount: current.dragEndCount + 1
            }))}
            onViewportChange={(viewport: GraphViewport) => setEvents(current => ({
              ...current,
              viewportCount: current.viewportCount + 1,
              viewportX: viewport.x,
              viewportY: viewport.y,
              viewportScale: viewport.scale
            }))}
            onError={(error) => setEvents(current => ({
              ...current,
              errors: [...current.errors, error.message]
            }))}
          />
        )}
      </div>

      <div className="status">
        <span data-testid="fixture-name">{fixtureName}</span>
        <span data-testid="mode-name">{mode}</span>
        <span data-testid="selected-node">{selectedNodeId ?? 'none'}</span>
        <span data-testid="graph-mounted">{graphMounted ? 'yes' : 'no'}</span>
        <span data-testid="graph-paused">{graphPaused ? 'yes' : 'no'}</span>
        <span data-testid="event-click">{events.click}</span>
        <span data-testid="event-double-click">{events.doubleClick}</span>
        <span data-testid="event-hover">{events.hover}</span>
        <span data-testid="event-drag-start">{events.dragStart}</span>
        <span data-testid="event-drag-start-count">{events.dragStartCount}</span>
        <span data-testid="event-drag-end">{events.dragEnd}</span>
        <span data-testid="event-drag-end-count">{events.dragEndCount}</span>
        <span data-testid="event-drag-count">{events.dragCount}</span>
        <span data-testid="event-viewport-count">{events.viewportCount}</span>
        <span data-testid="event-viewport-x">{events.viewportX.toFixed(1)}</span>
        <span data-testid="event-viewport-y">{events.viewportY.toFixed(1)}</span>
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
  run('npm', ['run', 'build'], { cwd: fixtureRoot });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepareBrowserConsumerFixture();
}
