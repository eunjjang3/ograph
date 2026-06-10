# API Reference

This document covers the production API exported from `src/components/graph/index.ts`.

## Entry Point

```ts
import {
  GraphView,
  defaultGraphPreset,
  defaultGraphTheme,
  type GraphLink,
  type GraphNode,
  type GraphNodeMetadata,
  type GraphNodeType,
  type GraphPreset,
  type GraphTheme,
  type GraphViewMode,
  type GraphViewProps,
  type GraphViewport,
  type GraphCameraFocusOptions,
  type GraphGrowthAnimationOptions,
  type GraphGrowthTimestamp,
  type GraphViewRef
} from '@eunjjang/ograph';
```

Do not import from internal source files in a consumer app. The debug harness and mock generators are intentionally excluded from the package boundary.

## Component

### `GraphView`

```tsx
<GraphView nodes={nodes} links={links} />
```

`GraphView` is a client-side React component that renders a graph onto a `<canvas>`. The built package entry preserves the `"use client"` directive for server-component frameworks, and browser APIs such as `ResizeObserver`, `window`, canvas APIs, and `devicePixelRatio` are still used only from effects or event handlers.

The component fills its container. The parent element must provide stable dimensions, for example a fixed height, flex-basis, or viewport-sized panel. Required container, canvas, touch-action, and tooltip styles are applied inline; consumers do not need Tailwind CSS or a package CSS import for core graph behavior.

Unmount cleanup cancels scheduled animation frames, detaches the d3-force tick listener before stopping the active simulation, releases internal pointer/drag state, and removes window-level listeners installed by the component hooks. If a graph unmounts during an active drag, the internal physics pin is released without firing consumer drag-end callbacks during teardown.

`GraphViewProps` is generic over consumer metadata:

```ts
type GraphViewProps<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
>
```

`NodeMetadata` is preserved through `nodes` and node callbacks. `LinkMetadata` is preserved through `links`.

## Props

### Required Data Props

| Prop | Type | Description |
| --- | --- | --- |
| `nodes` | `GraphNode<NodeMetadata>[]` | Nodes to render and simulate. |
| `links` | `GraphLink<LinkMetadata, NodeMetadata>[]` | Edges between node IDs or node objects. |

### Optional State Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `selectedNodeId` | `string \| null` | `undefined` | Externally controlled selected node. Selected nodes receive selection color and connected-neighborhood highlighting. |
| `hoveredNodeId` | `string \| null` | local hover state | Externally controlled hovered node. When supplied, it overrides local hover tracking. Passing `null` clears semantic hover immediately; the previous focus may still fade visually for the current transition. |
| `rootNodeId` | `string \| null` | `undefined` | Root node used for local lens mode and root highlighting. Must match an `id` in the provided `nodes` array. |
| `mode` | `'global' \| 'local'` | `'global'` | Whether to display the full graph or a local focus lens over the global layout. |
| `localDepth` | `number` | `2` | Visible breadth-first traversal depth from `rootNodeId` in local lens mode. Values are clamped to integers from `1` through `10`. |
| `growthAnimation` | `boolean \| GraphGrowthAnimationOptions<NodeMetadata>` | `undefined` | Optional chronological node reveal. `true` reads `node.metadata.createdAt`; an options object can provide a custom timestamp extractor, metadata key, step duration, and initial delay. |
| `cameraFocusNodeId` | `string \| null` | `undefined` | Camera-only focus request for a visible node. Does not change selection, hover, or local root state. |
| `cameraFocusOptions` | `GraphCameraFocusOptions` | `undefined` | Options for `cameraFocusNodeId`, including optional target scale, minimum scale, and animation control. |
| `paused` | `boolean` | `false` | Stops d3-force simulation ticks while keeping the canvas mounted and renderable. Use this when a consumer keeps the graph mounted inside a hidden or inactive panel. |

### Optional Configuration Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `Partial<GraphTheme>` | `defaultGraphTheme` | Partial theme override merged over the default theme. |
| `preset` | `'default' \| GraphPreset` | `'default'` | Force/layout/rendering preset. Custom presets are merged over `defaultGraphPreset`. |
| `className` | `string` | `''` | Additional class names applied to the outer container. |
| `style` | `CSSProperties` | `undefined` | Inline styles applied to the outer container after `backgroundColor`. |
| `ariaLabel` | `string` | `undefined` | Accessible name applied to the graph canvas. |
| `canvasRole` | `AriaRole` | `undefined` | Optional ARIA role applied to the graph canvas when the consumer needs a specific semantic role. |

### Event Props

| Prop | Type | When It Fires |
| --- | --- | --- |
| `onNodeClick` | `(node: GraphNode<NodeMetadata>) => void` | Pointer up on a node without dragging. |
| `onNodeDoubleClick` | `(node: GraphNode<NodeMetadata>) => void` | Second node click within the double-click threshold. |
| `onNodeHover` | `(node: GraphNode<NodeMetadata> \| null) => void` | Hover target changes. Receives `null` when no node is under the pointer or the pointer leaves the canvas. |
| `onNodeDragStart` | `(node: GraphNode<NodeMetadata>) => void` | Node drag crosses the movement threshold and begins physics pinning. |
| `onNodeDrag` | `(node: GraphNode<NodeMetadata>) => void` | Node drag position updates. |
| `onNodeDragEnd` | `(node: GraphNode<NodeMetadata>) => void` | Node drag ends or is cancelled. |
| `onViewportChange` | `(viewport: GraphViewport) => void` | Pan, zoom, reset, and fit operations update the viewport. |
| `onError` | `(error: Error) => void` | Graph-owned render, draw-loop, or simulation setup catches an error. React render failures fall back to an empty element inside the existing container background; canvas draw-loop and simulation errors stop the active graph loop before reporting. Consumer callback errors are not treated as graph-owned errors. |

## Data And Error Policy

`GraphView` treats malformed graph data as a data-boundary concern, not as a
reason to crash the host React app. The current preview policy is:

| Condition | Policy |
| --- | --- |
| `nodes` or `links` is not an array | Treat as an empty array. |
| node `id` is missing, empty, or not a string | Drop that node. |
| node `id` is duplicated | Keep the first node; warn in development. |
| node `label` is not a string | Coerce the label to the node ID. |
| node coordinate or velocity is `NaN`, `Infinity`, or not a finite number | Ignore that value so layout can choose a fallback. |
| `localDepth` is invalid, fractional, or outside the supported range | Coerce to an integer from `1` through `10`. |
| link endpoint is missing, malformed, dangling, or a self-link | Drop that link. |
| consumer metadata is present | Preserve it without interpretation. |

`onError` is reserved for graph-owned runtime failures: React render failures
caught by the graph error boundary, canvas draw-loop failures, and simulation
setup or tick failures. Data normalization does not call `onError` for every
dropped node or link in the current preview API; consumers that need strict
import diagnostics should validate data before passing it to `GraphView`.

Consumer callback failures are not caught as graph-owned errors. If
`onNodeClick`, `onNodeHover`, `onViewportChange`, or another consumer callback
throws, that exception belongs to the consumer app.

Environment limitations are handled defensively where possible. Missing
`ResizeObserver` falls back to window resize measurement, missing `matchMedia`
disables that media-query listener, zero-size containers skip drawing until
dimensions are available, and missing canvas contexts skip that frame. These
conditions do not currently call `onError`.

Camera focus requests for missing nodes, nodes outside the current render-visible
scope, or nodes with invalid coordinates are no-ops. They do not call `onError`.

## Imperative Ref

Use `GraphViewRef` when an outer toolbar needs to control the graph.

```tsx
import { useRef } from 'react';
import { GraphView, type GraphViewRef } from '@eunjjang/ograph';

const ref = useRef<GraphViewRef | null>(null);

<GraphView ref={ref} nodes={nodes} links={links} />;

ref.current?.fitToView();
ref.current?.focusCameraOnNode('node-a', { minScale: 1.5 });
ref.current?.resetViewport();
ref.current?.restartSimulation();
```

| Method | Description |
| --- | --- |
| `fitToView()` | Computes the visible global or local-lens bounds and sets the viewport so nodes fit with padding. |
| `focusCameraOnNode(nodeId, options?)` | Centers the camera on a visible node and returns `true` when the request can be applied. Returns `false` without moving the camera when the node is missing or not visible in the current graph scope. |
| `resetViewport()` | Centers the viewport and resets zoom scale to `1.0`. |
| `restartSimulation()` | Sets simulation alpha to `1` and restarts d3-force unless `paused` is `true`. If paused, the alpha is retained and resumes when `paused` returns to `false`. |

```ts
interface GraphCameraFocusOptions {
  scale?: number;
  minScale?: number;
  animated?: boolean;
}
```

By default, node focus preserves the current zoom scale and animates the camera.
`minScale` zooms in only when the current or requested scale is smaller, and
`animated: false` applies the viewport immediately. Reduced-motion users always
receive immediate camera updates.

## Simulation Pausing

`paused` is the public control for suspending graph physics without changing visibility or unmounting the component:

```tsx
<GraphView nodes={nodes} links={links} paused={!isPanelVisible} />
```

When `paused` is `true`, `GraphView` stops the d3-force timer and suppresses simulation restarts from graph refreshes, node drags, and `restartSimulation()`. Current node coordinates remain cached, and render-only work still runs: pan, zoom, resize redraws, hover and selection transitions, local-lens fades, and explicit canvas renders can update the visible canvas.

When `paused` changes back to `false`, the simulation resumes only if it still has heat above d3-force's `alphaMin`. This keeps already settled graphs settled while allowing graphs paused during initial layout or data changes to continue cooling from their frozen coordinates.

## Input Reference Stability

`GraphView` does not require callers to memoize the `nodes` and `links` arrays for physics stability. Internally, the simulation compares graph topology by content: node IDs plus valid undirected source/target pairs. Passing new array or object references with the same topology updates render payloads but does not rebuild or reheat the d3-force simulation.

Payload-only changes, including node labels, node type, groups, metadata, and link labels, are reflected without recreating simulation nodes. Node `size` is also payload, but it affects collision radius, so size changes refresh the collide force and apply only a minimal alpha kick, restarting immediately only when physics is not paused.

Links whose endpoints do not exist in the current node set are ignored for topology comparison, matching the graph traversal and indexing rules. Self-links where `source === target` are also ignored. Link `weight`, `strength`, `type`, and `metadata` are not part of the topology contract while the library uses preset-level force values. If per-link force parameters become active in a future release, those fields must be reconsidered for topology comparison.

## Chronological Growth Animation

`growthAnimation` replays a graph by revealing nodes in timestamp order. Each
step passes the revealed node/link subset into the existing d3-force simulation,
so newly revealed nodes can be pulled toward already visible neighbors as their
links become active. Links appear only after both endpoint nodes have been
revealed.

```tsx
<GraphView
  nodes={nodes}
  links={links}
  growthAnimation={{
    stepMs: 180,
    getNodeTimestamp: node => node.metadata?.createdAt
  }}
/>;
```

When `growthAnimation` is `true`, the default timestamp source is
`node.metadata?.createdAt`. Use `timestampMetadataKey` to read a different
metadata field, or `getNodeTimestamp` for a fully custom extractor. Timestamp
values may be ISO date strings, finite epoch-millisecond numbers, or `Date`
objects. Nodes with missing or invalid timestamps are revealed after timestamped
nodes in their original input order, and timestamp ties also preserve input
order.

```ts
type GraphGrowthTimestamp = string | number | Date | null | undefined;

interface GraphGrowthAnimationOptions<NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata> {
  enabled?: boolean;
  getNodeTimestamp?: (node: GraphNode<NodeMetadata>) => GraphGrowthTimestamp;
  timestampMetadataKey?: string;
  stepMs?: number;
  initialDelayMs?: number;
}
```

Users who prefer reduced motion see the complete graph immediately.

## Data Contracts

`GraphView` normalizes graph input once at the public component boundary before
rendering, traversal, simulation, and hit testing run. The current normalization
policy is intentionally conservative:

- node IDs must be non-empty strings,
- duplicate node IDs keep the first node and warn in development,
- non-string labels are coerced to the node ID,
- dangling links and self-links are dropped,
- non-finite node coordinates and velocities are ignored so layout can assign
  safe fallback values,
- caller-owned node and link arrays are not mutated by normalization.

This keeps malformed imported graph data out of lower-level graph code without
changing the visual behavior of valid graph inputs.

### `GraphNode`

```ts
interface GraphNode<Metadata extends GraphNodeMetadata = GraphNodeMetadata> {
  id: string;
  label: string;
  type?: GraphNodeType;
  group?: string;
  size?: number;
  degree?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  metadata?: Metadata;
}
```

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Stable unique node ID. Links refer to this value. Nodes with empty or non-string IDs are dropped before graph hooks run. |
| `label` | yes | Text rendered at the current label visibility opacity; focused labels are forced visible. Non-string labels are coerced to the node ID. |
| `type` | no | Visual category. See `GraphNodeType`. |
| `group` | no | Consumer-defined grouping value. The production component does not interpret it directly. |
| `size` | no | Non-negative finite multiplier applied to the base node radius. Negative, non-finite, or non-number values are removed at the public input boundary and render with the default multiplier. |
| `degree` | no | Optional precomputed degree. The simulation recalculates active degree from links and writes it onto active simulation nodes. |
| `x`, `y` | no | Initial finite world coordinates. If absent or non-finite, the simulation assigns a small random starting position. |
| `vx`, `vy` | no | Initial finite d3-force velocity values. |
| `fx`, `fy` | no | Finite d3-force fixed coordinates or `null`. Dragging temporarily sets these values. |
| `metadata` | no | Consumer-owned data. The graph package stores and returns it without interpretation. |

### `GraphNodeType`

```ts
type GraphNodeType =
  | 'note'
  | 'tag'
  | 'attachment'
  | 'unresolved'
  | 'hub'
  | 'structure'
  | 'domain';
```

`structure` and `domain` currently share the hub color path. Unknown or omitted types use `nodeDefaultColor`.

### `GraphLink`

```ts
interface GraphLink<
  Metadata extends GraphNodeMetadata = GraphNodeMetadata,
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata
> {
  source: string | GraphNode<NodeMetadata>;
  target: string | GraphNode<NodeMetadata>;
  type?: string;
  weight?: number;
  strength?: number;
  label?: string;
  metadata?: Metadata;
}
```

`source` and `target` may be node IDs or node objects. During d3-force setup, links are copied and source/target are normalized to IDs before d3 resolves them into node object references.

Links whose `source` or `target` does not match a provided node ID are ignored by traversal, simulation, rendering, and focus-neighbor indexes. Links where `source === target` are silently dropped. This keeps malformed imported graph data from crashing force setup or creating render/simulation divergence.

The current renderer does not draw link labels or vary link width by `weight`, `strength`, or `type`; local traversal also does not inspect `type`. Those fields are available for consumers and future rendering behavior.

### `GraphViewport`

```ts
interface GraphViewport {
  x: number;
  y: number;
  scale: number;
}
```

`x` and `y` are screen-space translation offsets in CSS pixels. `scale` is the zoom factor. The component clamps zoom between `0.02` and `32.0`.

Wheel and pinch input report the target viewport through `onViewportChange` while the canvas eases the displayed viewport toward that target. Programmatic `fitToView()` and `resetViewport()` still apply immediately.

## Theme

`GraphTheme` controls canvas colors and label typography.

```ts
interface GraphTheme {
  backgroundColor: string;
  nodeNoteColor: string;
  nodeTagColor: string;
  nodeAttachmentColor: string;
  nodeUnresolvedColor: string;
  nodeHubColor: string;
  nodeDefaultColor: string;
  nodeSelectedColor: string;
  nodeHoverColor: string;
  nodeRootColor: string;
  nodeNeighborColor: string;
  nodeBorderColor: string;
  nodeBorderSelectedColor: string;
  linkColor: string;
  linkHoverColor: string;
  linkSelectedColor: string;
  linkRootColor: string;
  linkNeighborColor: string;
  labelColor: string;
  labelHoverColor: string;
  labelSelectedColor: string;
  labelRootColor: string;
  fontFamily: string;
}
```

Pass a partial theme to override only the values a consumer owns:

```tsx
<GraphView
  nodes={nodes}
  links={links}
  theme={{
    backgroundColor: '#101014',
    nodeSelectedColor: '#7dd3fc'
  }}
/>
```

Colors may be hex strings, named colors, or canvas-compatible CSS color strings such as `rgba(...)`.

## Preset

`GraphPreset` controls force layout and rendering heuristics.

```ts
interface GraphPreset {
  nodeRadius: number;
  linkDistance: number;
  chargeStrength: number;
  collisionRadius: number;
  labelDensity: number;
  labelRenderBudget?: {
    maxLabels?: number;
    maxLabelsDuringInteraction?: number;
  };
  hoverDimming: number;
  selectionDimming: number;
  localGraphDepthBehavior: number;
  nodeSizeScale?: number;
  gravityStrength?: number;
  velocityDecay?: number;
  alphaDecay?: number;
}
```

| Field | Description |
| --- | --- |
| `nodeRadius` | Base node radius before sanitized `size` and `degree` are applied. `nodeSizeScale` is applied only while rendering and hit-testing. |
| `linkDistance` | d3-force link distance. |
| `chargeStrength` | d3-force many-body strength. Negative values repel nodes. |
| `collisionRadius` | Extra radius added to node collision bounds. Collision uses `nodeRadius`, sanitized `size`, and `degree`, but intentionally ignores `nodeSizeScale`. |
| `labelDensity` | `0` to `1` density control. Higher values show more labels earlier. Non-focused labels use this as the center of a soft zoom/degree reveal band, producing target opacity values from `0` to `1` instead of a hard show/hide cutoff. |
| `labelRenderBudget` | Optional per-frame label caps. `maxLabels` applies to settled frames; `maxLabelsDuringInteraction` applies during pan, drag, pinch, viewport animation, active simulation, and focus/lens/label transitions. The interaction cap falls back to `maxLabels` when omitted. Invalid or negative values disable that cap. Hovered, selected, and root labels remain visible even when they exceed the cap; focused neighbors rank ahead of ordinary labels while still counting toward it. |
| `hoverDimming` | Opacity multiplier for unrelated nodes/links during hover focus. The transition is eased in the canvas render loop; hover highlights fade as an overlay when hover clears. |
| `selectionDimming` | Opacity multiplier for unrelated nodes/links during selected focus. The transition is eased in the canvas render loop; selection highlights use the same overlay fade when selection clears. |
| `localGraphDepthBehavior` | Reserved preset field mirroring local-depth behavior. The component currently uses the `localDepth` prop for traversal. |
| `nodeSizeScale` | Global multiplier for rendered and hit-tested node size. This does not restart or influence the d3-force simulation. |
| `gravityStrength` | Gentle force pulling the layout toward the origin. |
| `velocityDecay` | d3-force velocity decay value clamped to `0` through `1`. The default is `0.4`; lower values feel more floaty and keep motion longer, while higher values feel heavier and settle faster. |
| `alphaDecay` | Optional d3-force alpha decay override clamped to `(0, 1]`. Omit it to use mode defaults: global mode keeps d3's 300-tick cooling curve at about `0.0228`, while local mode uses `0.08` so small focus lenses settle quickly. `alphaMin` remains internal: `0.001` globally and `0.005` in local mode. |

Example:

```tsx
<GraphView
  nodes={nodes}
  links={links}
  preset={{
    nodeRadius: 4.5,
    linkDistance: 60,
    chargeStrength: -80,
    collisionRadius: 10,
    labelDensity: 0.7,
    labelRenderBudget: {
      maxLabels: 160,
      maxLabelsDuringInteraction: 48
    },
    hoverDimming: 0.25,
    selectionDimming: 0.15,
    localGraphDepthBehavior: 2,
    nodeSizeScale: 1.2,
    gravityStrength: 0.1,
    velocityDecay: 0.4,
    // Omit alphaDecay to keep mode-specific cooling defaults.
  }}
/>
```

## Controlled Selection Example

```tsx
function ControlledGraph({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <GraphView
      nodes={nodes}
      links={links}
      selectedNodeId={selectedNodeId}
      onNodeClick={(node) => setSelectedNodeId(node.id)}
    />
  );
}
```

## Local Graph Example

```tsx
<GraphView
  nodes={nodes}
  links={links}
  mode="local"
  rootNodeId={selectedNodeId}
  localDepth={2}
/>
```

`selectedNodeId` and `rootNodeId` are intentionally independent. The component does not clear selection when mode or root changes; consumer state should do that when a local-root focus flow should not keep a selected-node highlight.

`rootNodeId` must match an `id` in the provided `nodes` array. Consumers that keep route slugs, database UUIDs, or other app-specific identifiers should normalize them before passing graph props; `GraphView` does not resolve alternate ID schemes.

If `mode="local"` and `rootNodeId` is missing, the component renders the full graph. If `rootNodeId` is present but not found in `nodes`, it renders an empty lens without moving the camera.

Local traversal uses every valid link in the `links` array and treats those links as undirected. `GraphView` does not inspect `link.type` when expanding the BFS neighborhood. To exclude relationship types from local expansion, filter the `links` array before passing it to `GraphView`.

Local mode is a focus lens over the global layout rather than a separate layout. Lens-external nodes fade out while the camera eases toward the visible neighborhood and the local halo simulation settles concurrently. The internal force simulation retains one hidden breadth-first halo ring beyond `localDepth` to stabilize boundary nodes. Sparse local scopes keep their existing centroid as the simulation gravity center, preventing isolated or one-neighbor roots from sliding toward the global origin during the zoom. Hidden and halo-only nodes do not participate in hit testing. Returning to global mode fades the full graph back in and restores the viewport captured before local entry.

Local mode uses faster cooling defaults than global mode: refreshes still reheat at the low local alpha, `alphaDecay` defaults to `0.08`, and the internal `alphaMin` is raised to `0.005` to avoid spending frames on visually insignificant cooling. Consumers that need a slower or faster local lens can pass `preset={{ ...defaultGraphPreset, alphaDecay: value }}`; node-count based automatic cooling is not used, so the behavior is predictable from `mode` and the optional preset override.

The lens transition defaults to `360ms`. Consumers do not configure the timing or halo depth through the public API. Users who request reduced motion through `prefers-reduced-motion: reduce` receive immediate scope and viewport changes.
