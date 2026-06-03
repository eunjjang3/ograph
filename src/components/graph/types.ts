import type { AriaRole, CSSProperties } from 'react';

/** Visual category used to resolve the default node color. */
export type GraphNodeType =
  | "note"
  | "tag"
  | "attachment"
  | "unresolved"
  | "hub"
  | "structure"
  | "domain";

/** Consumer-owned metadata stored on nodes and links without interpretation. */
export type GraphNodeMetadata = Record<string, unknown>;

/** A graph node rendered and simulated by `GraphView`. */
export interface GraphNode<Metadata extends GraphNodeMetadata = GraphNodeMetadata> {
  /** Stable unique node ID. Empty or non-string IDs are dropped at the public input boundary. */
  id: string;
  /** Human-readable label drawn near the node when label visibility rules allow it. */
  label: string;
  /** Optional visual category used by the default color resolver. */
  type?: GraphNodeType;
  /** Optional consumer-defined grouping value. */
  group?: string;
  /** Optional visual size multiplier. */
  size?: number;
  /** Optional precomputed degree; active simulation degree is recalculated from valid links. */
  degree?: number;
  /** Optional initial world X coordinate. */
  x?: number;
  /** Optional initial world Y coordinate. */
  y?: number;
  /** Optional initial d3-force X velocity. */
  vx?: number;
  /** Optional initial d3-force Y velocity. */
  vy?: number;
  /** Optional fixed d3-force X coordinate. Dragging temporarily writes this value. */
  fx?: number | null;
  /** Optional fixed d3-force Y coordinate. Dragging temporarily writes this value. */
  fy?: number | null;
  /** Consumer-owned metadata returned through node callbacks without interpretation. */
  metadata?: Metadata;
}

/** A graph edge connecting two node IDs or node objects. */
export interface GraphLink<
  Metadata extends GraphNodeMetadata = GraphNodeMetadata,
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata
> {
  /** Source endpoint as a node ID or node object. Links with missing endpoints are dropped. */
  source: string | GraphNode<NodeMetadata>;
  /** Target endpoint as a node ID or node object. Self-links and missing endpoints are dropped. */
  target: string | GraphNode<NodeMetadata>;
  /** Optional consumer-defined relationship type. */
  type?: string;
  /** Optional consumer-defined edge weight. The current renderer does not vary width by weight. */
  weight?: number;
  /** Optional consumer-defined force strength. The current simulation uses preset-level strength. */
  strength?: number;
  /** Optional consumer-defined edge label. The current renderer does not draw link labels. */
  label?: string;
  /** Consumer-owned metadata stored without interpretation. */
  metadata?: Metadata;
}

/** Canvas color and typography tokens used by the graph renderer. */
export interface GraphTheme {
  /** Canvas and container background color. */
  backgroundColor: string;

  /** Default color for note nodes. */
  nodeNoteColor: string;
  /** Default color for tag nodes. */
  nodeTagColor: string;
  /** Default color for attachment nodes. */
  nodeAttachmentColor: string;
  /** Default color for unresolved nodes. */
  nodeUnresolvedColor: string;
  /** Default color for hub, structure, and domain nodes. */
  nodeHubColor: string;
  /** Fallback color for unknown or omitted node types. */
  nodeDefaultColor: string;
  /** Overlay color for the selected node. */
  nodeSelectedColor: string;
  /** Overlay color for the hovered node. */
  nodeHoverColor: string;
  /** Overlay color for the local lens root node. */
  nodeRootColor: string;
  /** Overlay color for focused neighbor nodes. */
  nodeNeighborColor: string;

  /** Default node outline color. */
  nodeBorderColor: string;
  /** Selected node outline color. */
  nodeBorderSelectedColor: string;

  /** Default link stroke color. */
  linkColor: string;
  /** Hover-focus link stroke color. */
  linkHoverColor: string;
  /** Selection-focus link stroke color. */
  linkSelectedColor: string;
  /** Root-focus link stroke color. */
  linkRootColor: string;
  /** Neighbor-focus link stroke color. */
  linkNeighborColor: string;

  /** Default label fill color. */
  labelColor: string;
  /** Hovered label fill color. */
  labelHoverColor: string;
  /** Selected label fill color. */
  labelSelectedColor: string;
  /** Root label fill color. */
  labelRootColor: string;

  /** CSS font-family string used for node labels. */
  fontFamily: string;
}

/** Force-layout and rendering heuristics used by `GraphView`. */
export interface GraphPreset {
  /** Base rendered node radius in CSS pixels. */
  nodeRadius: number;
  /** d3-force link distance in world units. */
  linkDistance: number;
  /** d3-force many-body charge strength. */
  chargeStrength: number;
  /** Extra collision padding added around each physics node. */
  collisionRadius: number;
  /** Label reveal density from `0` to `1`; higher values reveal labels earlier. */
  labelDensity: number;
  /** Opacity multiplier for unrelated graph elements during hover focus. */
  hoverDimming: number;
  /** Opacity multiplier for unrelated graph elements during selection focus. */
  selectionDimming: number;
  /** Default traversal depth used by debug presets and consumers that mirror preset behavior. */
  localGraphDepthBehavior: number;

  /** Optional rendered node size multiplier. */
  nodeSizeScale?: number;
  /** Optional gravity strength around the simulation center. */
  gravityStrength?: number;
  /** Optional d3-force velocity decay, clamped to the valid d3 range. */
  velocityDecay?: number;
  /** Optional d3-force alpha decay override, clamped to the valid d3 range. */
  alphaDecay?: number;
}

/** Global graph mode or local focus-lens mode. */
export type GraphViewMode = "global" | "local";

/** Screen-space graph viewport emitted through `onViewportChange`. */
export interface GraphViewport {
  /** Screen-space X translation in CSS pixels. */
  x: number;
  /** Screen-space Y translation in CSS pixels. */
  y: number;
  /** Zoom scale clamped by the graph pointer controls. */
  scale: number;
}

/** Props accepted by the public `GraphView` component. */
export interface GraphViewProps<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
> {
  /** Nodes to render and simulate. Invalid IDs are dropped before graph hooks run. */
  nodes: GraphNode<NodeMetadata>[];
  /** Links to render and simulate. Dangling links and self-links are dropped before graph hooks run. */
  links: GraphLink<LinkMetadata, NodeMetadata>[];
  /** Externally controlled selected node ID. */
  selectedNodeId?: string | null;
  /** Externally controlled hovered node ID; when omitted, hover is tracked locally. */
  hoveredNodeId?: string | null;
  /** Root node ID used for local focus-lens mode and root highlighting. */
  rootNodeId?: string | null;
  /** Whether to display the full graph or the local focus lens. */
  mode?: GraphViewMode;
  /** Local focus traversal depth, clamped to an integer from `1` through `10`. */
  localDepth?: number;
  /** Stops d3-force ticks while keeping the canvas mounted and renderable. */
  paused?: boolean;
  /** Partial theme override merged over `defaultGraphTheme`. */
  theme?: Partial<GraphTheme>;
  /** Force/layout/rendering preset or the built-in default preset. */
  preset?: "default" | GraphPreset;
  /** Additional class names applied to the outer graph container. */
  className?: string;
  /** Inline styles applied to the outer graph container after the background color. */
  style?: CSSProperties;
  /** Accessible name applied to the canvas element for assistive technologies. */
  ariaLabel?: string;
  /** Optional ARIA role applied to the canvas when a consumer needs a specific semantic role. */
  canvasRole?: AriaRole;

  /** Called when a node is clicked without dragging. */
  onNodeClick?: (node: GraphNode<NodeMetadata>) => void;
  /** Called on a second click within the graph double-click threshold. */
  onNodeDoubleClick?: (node: GraphNode<NodeMetadata>) => void;
  /** Called when the semantic hover target changes. */
  onNodeHover?: (node: GraphNode<NodeMetadata> | null) => void;
  /** Called when a node drag starts after the movement threshold. */
  onNodeDragStart?: (node: GraphNode<NodeMetadata>) => void;
  /** Called as a dragged node position updates. */
  onNodeDrag?: (node: GraphNode<NodeMetadata>) => void;
  /** Called when a node drag ends or is cancelled. */
  onNodeDragEnd?: (node: GraphNode<NodeMetadata>) => void;
  /** Called when pan, zoom, reset, or fit operations update the target viewport. */
  onViewportChange?: (viewport: GraphViewport) => void;
  /** Called when graph-owned render, draw-loop, or simulation setup catches an error. */
  onError?: (error: Error) => void;
}
