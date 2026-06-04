# Ograph

Reusable interactive force-directed canvas graph component for React applications.

The package is designed for applications that need a large interactive node-link graph without owning the rendering, layout, local-focus lens, and pointer interaction machinery themselves. The production component is intentionally app-agnostic: consumers provide graph data and own persistence, routing, editing flows, auth, and domain-specific metadata.

## What This Package Provides

- `GraphView`, a canvas-based React component for rendering force-directed graphs.
- TypeScript data contracts for graph nodes, links, themes, presets, view modes, and viewport events.
- Default dark graph theme and force preset values.
- Local/global graph modes, node selection and hover highlighting, drag-to-reposition, pan, wheel zoom, and pinch zoom.
- Declarative simulation pausing for hidden or inactive graph panels.
- A Vite debug harness for generating deterministic stress-test graphs up to 10,000 nodes.

## Project Status

`@afterglow/ograph` is an early pre-1.0 package being prepared for public preview so the rendering model, package boundary, and API direction can be reviewed before a production-ready release. Expect API and behavior changes before `1.0.0`.

## Documentation

These public documents are included in the published package tarball as well as the repository:

- [API Reference](docs/api.md) documents the exported package API, data/error policy, props, callbacks, and imperative ref methods.
- [Architecture](docs/architecture.md) explains rendering, simulation, local lens scoping, hit testing, and the package boundary.
- [Debug Harness](docs/debug-harness.md) documents the local stress-test UI and mock graph generator.

The repository keeps the same public documentation boundary as the package tarball so the project stays app-agnostic for new consumers.

Repository examples live under [examples](examples/README.md). They import from
`@afterglow/ograph` and are typechecked with `npm run check:examples`.

## Install In A Consumer

The production entry point is shaped for package imports:

```ts
import {
  GraphView,
  defaultGraphPreset,
  defaultGraphTheme,
  type GraphLink,
  type GraphNode,
  type GraphViewProps
} from '@afterglow/ograph';
```

Until the first npm publication, install from the GitHub repository after it is public, or clone the repository and build locally:

```sh
npm install github:eunjjang3/ograph
```

For local package verification:

```sh
npm install
npm run build
```

## Basic Usage

```tsx
import { GraphView, type GraphLink, type GraphNode } from '@afterglow/ograph';

const nodes: GraphNode[] = [
  { id: 'node-a', label: 'Node A', type: 'note' },
  { id: 'node-b', label: 'Node B', type: 'note' },
  { id: 'tag-react', label: '#react', type: 'tag' }
];

const links: GraphLink[] = [
  { source: 'node-a', target: 'node-b' },
  { source: 'node-a', target: 'tag-react' }
];

export function GraphPanel() {
  return (
    <div style={{ width: 800, height: 600 }}>
      <GraphView
        nodes={nodes}
        links={links}
        onNodeClick={(node) => console.log(node.id)}
      />
    </div>
  );
}
```

The component fills its parent element. Give the parent a stable width and height. Required container, canvas, touch, and tooltip styles are applied inline by the package, so consumer apps do not need Tailwind CSS or a package CSS import for core graph behavior.

Consumer metadata types are preserved through node callbacks:

```tsx
type NodeMetadata = {
  slug: string;
};

const nodes: GraphNode<NodeMetadata>[] = [
  { id: 'node-a', label: 'Node A', metadata: { slug: 'node-a' } }
];

<GraphView
  nodes={nodes}
  links={[]}
  ariaLabel="Knowledge graph"
  onNodeClick={(node) => console.log(node.metadata?.slug)}
/>;
```

The production package entry preserves the `"use client"` directive for React server-component frameworks such as Next.js App Router.

## Interaction Model

- Drag a node to pin it temporarily and reheat connected physics.
- Drag the background to pan.
- Scroll over the canvas to smoothly zoom toward the pointer.
- Pinch with two touches to smoothly zoom on touch devices.
- Click a node to emit `onNodeClick`.
- Double-click a node to emit `onNodeDoubleClick`.
- Hover a node to emit `onNodeHover` and show the built-in compact tooltip. Moving off a node or leaving the canvas emits `onNodeHover(null)`.

Selection and hover are controlled externally through `selectedNodeId` and `hoveredNodeId`. If `hoveredNodeId` is omitted, the component maintains local hover state while still calling `onNodeHover`.
Hover state clears immediately when the pointer leaves the active node; the renderer keeps the previous focus only as a fading overlay so highlighted links and nodes fall back smoothly instead of staying fully highlighted. Focus dimming and label visibility are animated in the canvas render loop, so unrelated nodes fade between focus states and non-focused labels reveal gradually from `0` to `1` as zoom, density, and node degree make them eligible.
Selection and local root focus are separate concepts. Consumer apps that treat a selected node as the local root should clear or remap `selectedNodeId` when leaving that focused flow if selection highlighting should not persist.

Use `paused` when the graph remains mounted but is hidden or inactive:

```tsx
<GraphView nodes={nodes} links={links} paused={!isPanelVisible} />
```

Pausing stops the d3-force timer without unmounting the canvas or losing the current layout. Viewport, hover, selection, resize, and explicit redraw updates can still render while physics is paused. When `paused` returns to `false`, any remaining simulation heat resumes from the frozen coordinates.

## Graph Modes

Global mode renders the full graph:

```tsx
<GraphView nodes={nodes} links={links} mode="global" />
```

Local mode turns the global layout into a focus lens around `rootNodeId`:

```tsx
<GraphView
  nodes={nodes}
  links={links}
  mode="local"
  rootNodeId="node-a"
  localDepth={2}
/>
```

Local graph traversal treats links as undirected for display purposes and uses every valid link supplied through `links`. The package does not interpret `link.type` for local expansion; consumers that want local mode to ignore hierarchy or containment relationships should filter those links before passing them to `GraphView`. Lens-external nodes fade out while the viewport zooms toward the visible neighborhood and the local halo simulation settles concurrently. One hidden BFS halo ring remains in the active simulation to keep boundary nodes stable. Sparse local scopes keep their existing centroid as the simulation gravity center, so isolated or one-neighbor roots do not drift toward an unrelated origin while the camera zooms. Local mode also uses faster d3 cooling defaults than global mode, avoiding long redraw tails for small graph neighborhoods while leaving global graph settling conservative. Returning to global mode restores the previous global viewport.

`GraphView` is defensive against reference-unstable input arrays. If a parent creates fresh `nodes` or `links` arrays with the same node IDs and valid undirected link structure, the canvas payload updates but the d3-force simulation is not rebuilt or reheated.

## Run Locally

**Prerequisites:** Node.js 22.14.0 or newer for repository development and verification.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Run the app:

   ```sh
   npm run dev
   ```

## Verify

```sh
npm run test
npm run lint
npm run build
npm run check:examples
npm run verify:consumer
npx playwright install chromium
npm run test:browser
```

`npm run test` includes unit/API tests and the no-new-dependency package budget check. `npm run build` creates both the demo build under `dist/demo` and the package build under `dist/index.js` with declarations under `dist`.
`npm run test:browser` packs the package, installs that tarball into a temporary Vite React consumer app, and runs the Chromium Playwright browser smoke tests.

## Contributing And Security

- [Contributing](CONTRIBUTING.md) explains local setup, verification, and package boundaries.
- [Security](SECURITY.md) explains how to report security-sensitive issues.
- [Changelog](CHANGELOG.md) records public releases.

## License

MIT
