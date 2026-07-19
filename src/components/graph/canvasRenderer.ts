import type { GraphNode, GraphLink, GraphTheme, GraphPreset } from './types';
import type { Viewport } from './graphMath';
import { getNodeRadius, resolveLabelVisibilityTarget } from './graphMath';
import {
  getPaddedViewportWorldBounds,
  isLinkInBounds,
  querySpatialIndex,
  type GraphSpatialIndex,
  type WorldBounds
} from './spatialIndex';

interface FocusRenderState {
  hasActiveFocus: boolean;
  focusNodeId: string | null | undefined;
  focusProgress: number;
  selectedNodeId: string | null | undefined;
  hoveredNodeId: string | null | undefined;
  rootNodeId: string | null | undefined;
  neighbors: ReadonlySet<string>;
  resolveDimAlpha: (dimAlpha: number) => number;
  isSelected: (id: string) => boolean;
  isHovered: (id: string) => boolean;
  isRoot: (id: string) => boolean;
  isNeighbor: (id: string) => boolean;
}

interface LabelRenderCandidate {
  id: string;
  index: number;
  forceVisible: boolean;
  isNeighbor: boolean;
  visibility: number;
  degree: number;
}

function normalizeLabelRenderBudget(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.floor(value);
}

export function resolveLabelRenderBudget(
  config: GraphPreset['labelRenderBudget'],
  interactionActive: boolean
): number | undefined {
  if (!config) return undefined;

  if (interactionActive && config.maxLabelsDuringInteraction !== undefined) {
    return normalizeLabelRenderBudget(config.maxLabelsDuringInteraction);
  }

  return normalizeLabelRenderBudget(config.maxLabels);
}

export function selectLabelNodeIdsForBudget(
  candidates: readonly LabelRenderCandidate[],
  budget: number
): Set<string> {
  const forced = candidates.filter(candidate => candidate.forceVisible);
  const selectedIds = new Set(forced.map(candidate => candidate.id));
  const availableSlots = Math.max(0, Math.floor(budget) - forced.length);

  if (availableSlots === 0) {
    return selectedIds;
  }

  const ranked = candidates
    .filter(candidate => !candidate.forceVisible)
    .sort((left, right) => {
      if (left.isNeighbor !== right.isNeighbor) {
        return left.isNeighbor ? -1 : 1;
      }
      if (left.visibility !== right.visibility) {
        return right.visibility - left.visibility;
      }
      if (left.degree !== right.degree) {
        return right.degree - left.degree;
      }
      return left.index - right.index;
    });

  for (let i = 0; i < Math.min(availableSlots, ranked.length); i++) {
    selectedIds.add(ranked[i]!.id);
  }

  return selectedIds;
}

function createFocusRenderState(
  selectedNodeId: string | null | undefined,
  hoveredNodeId: string | null | undefined,
  rootNodeId: string | null | undefined,
  neighbors: ReadonlySet<string>,
  dimProgress: number
): FocusRenderState {
  const hasActiveFocus = !!selectedNodeId || !!hoveredNodeId;
  const focusNodeId = hoveredNodeId || selectedNodeId;
  const focusProgress = Math.max(0, Math.min(1, dimProgress));

  return {
    hasActiveFocus,
    focusNodeId,
    focusProgress,
    selectedNodeId,
    hoveredNodeId,
    rootNodeId,
    neighbors,
    resolveDimAlpha: (dimAlpha: number) => 1 + (dimAlpha - 1) * focusProgress,
    isSelected: (id: string) => id === selectedNodeId,
    isHovered: (id: string) => id === hoveredNodeId,
    isRoot: (id: string) => id === rootNodeId,
    isNeighbor: (id: string) => neighbors.has(id)
  };
}

function resolveFocusDimming(preset: GraphPreset, focus: FocusRenderState) {
  const dimVal = focus.focusNodeId === focus.hoveredNodeId
    ? preset.hoverDimming
    : preset.selectionDimming;
  return focus.resolveDimAlpha(dimVal);
}

function resolveNodeBaseColor(node: GraphNode, theme: GraphTheme, focus: FocusRenderState) {
  if (focus.isRoot(node.id)) {
    return theme.nodeRootColor;
  }

  switch (node.type) {
    case 'note':
      return theme.nodeNoteColor;
    case 'tag':
      return theme.nodeTagColor;
    case 'attachment':
      return theme.nodeAttachmentColor;
    case 'unresolved':
      return theme.nodeUnresolvedColor;
    case 'hub':
    case 'structure':
    case 'domain':
      return theme.nodeHubColor;
    default:
      return theme.nodeDefaultColor;
  }
}

interface Circle {
  node: GraphNode;
  radius: number;
}

interface Line {
  source: GraphNode;
  target: GraphNode;
}

function getBatchKey(color: string, alpha: number, lineWidth = 0): string {
  return `${color}|${alpha.toFixed(3)}|${lineWidth.toFixed(3)}`;
}

function addLineBatch(
  batches: Map<string, { color: string; alpha: number; lineWidth: number; lines: Line[] }>,
  source: GraphNode,
  target: GraphNode,
  color: string,
  alpha: number,
  lineWidth: number
) {
  if (alpha <= 0.001) return;
  const key = getBatchKey(color, alpha, lineWidth);
  const batch = batches.get(key);

  if (batch) {
    batch.lines.push({ source, target });
  } else {
    batches.set(key, { color, alpha, lineWidth, lines: [{ source, target }] });
  }
}

function flushLineBatches(
  ctx: CanvasRenderingContext2D,
  batches: Map<string, { color: string; alpha: number; lineWidth: number; lines: Line[] }>
) {
  for (const batch of batches.values()) {
    ctx.strokeStyle = batch.color;
    ctx.globalAlpha = batch.alpha;
    ctx.lineWidth = batch.lineWidth;
    ctx.beginPath();

    for (const line of batch.lines) {
      ctx.moveTo(line.source.x ?? 0, line.source.y ?? 0);
      ctx.lineTo(line.target.x ?? 0, line.target.y ?? 0);
    }

    ctx.stroke();
  }
}

function addCircleBatch(
  batches: Map<string, { color: string; alpha: number; lineWidth: number; circles: Circle[] }>,
  node: GraphNode,
  radius: number,
  color: string,
  alpha: number,
  lineWidth = 0
) {
  if (alpha <= 0.001) return;
  const key = getBatchKey(color, alpha, lineWidth);
  const batch = batches.get(key);

  if (batch) {
    batch.circles.push({ node, radius });
  } else {
    batches.set(key, { color, alpha, lineWidth, circles: [{ node, radius }] });
  }
}

function flushCircleBatches(
  ctx: CanvasRenderingContext2D,
  batches: Map<string, { color: string; alpha: number; lineWidth: number; circles: Circle[] }>,
  stroke = false
) {
  for (const batch of batches.values()) {
    ctx.globalAlpha = batch.alpha;
    ctx.beginPath();

    for (const circle of batch.circles) {
      ctx.moveTo((circle.node.x ?? 0) + circle.radius, circle.node.y ?? 0);
      ctx.arc(circle.node.x ?? 0, circle.node.y ?? 0, circle.radius, 0, 2 * Math.PI);
    }

    if (stroke) {
      ctx.strokeStyle = batch.color;
      ctx.lineWidth = batch.lineWidth;
      ctx.stroke();
    } else {
      ctx.fillStyle = batch.color;
      ctx.fill();
    }
  }
}

function resolveLensNodeAlpha(nodeId: string, lensVisibilityByNodeId?: Map<string, number>): number {
  return lensVisibilityByNodeId?.get(nodeId) ?? 1;
}

function resolveLensLinkAlpha(
  sourceId: string,
  targetId: string,
  lensVisibilityByNodeId?: Map<string, number>
): number {
  return Math.pow(
    Math.min(
      resolveLensNodeAlpha(sourceId, lensVisibilityByNodeId),
      resolveLensNodeAlpha(targetId, lensVisibilityByNodeId)
    ),
    1.6
  );
}

function drawLinks(
  ctx: CanvasRenderingContext2D,
  links: GraphLink[],
  viewport: Viewport,
  theme: GraphTheme,
  preset: GraphPreset,
  focus: FocusRenderState,
  bounds: WorldBounds,
  lensVisibilityByNodeId?: Map<string, number>
) {
  const baseBatches = new Map<string, { color: string; alpha: number; lineWidth: number; lines: Line[] }>();
  const overlayBatches = new Map<string, { color: string; alpha: number; lineWidth: number; lines: Line[] }>();
  const lineWidth = 1.1 / Math.max(0.6, Math.min(viewport.scale, 2.0));

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const sourceNode = typeof link.source === 'object' ? (link.source as GraphNode) : null;
    const targetNode = typeof link.target === 'object' ? (link.target as GraphNode) : null;

    if (!sourceNode || !targetNode || !isLinkInBounds(link, bounds)) continue;

    const sourceId = sourceNode.id;
    const targetId = targetNode.id;
    const lensAlpha = resolveLensLinkAlpha(sourceId, targetId, lensVisibilityByNodeId);
    if (lensAlpha <= 0.001) continue;

    let baseLinkColor = theme.linkColor;
    let baseLinkAlpha = 1.0;
    let overlayLinkColor: string | null = null;
    let overlayLinkAlpha = 0;

    if (focus.hasActiveFocus) {
      const isConnectedToFocus = sourceId === focus.focusNodeId || targetId === focus.focusNodeId;
      if (isConnectedToFocus) {
        if (focus.isHovered(sourceId) || focus.isHovered(targetId)) {
          overlayLinkColor = theme.linkHoverColor;
        } else if (focus.isSelected(sourceId) || focus.isSelected(targetId)) {
          overlayLinkColor = theme.linkSelectedColor;
        } else {
          overlayLinkColor = theme.linkNeighborColor;
        }
        overlayLinkAlpha = focus.focusProgress;
      } else if ((focus.isRoot(sourceId) && focus.isNeighbor(targetId)) || (focus.isRoot(targetId) && focus.isNeighbor(sourceId))) {
        overlayLinkColor = theme.linkRootColor;
        overlayLinkAlpha = focus.focusProgress;
      } else {
        baseLinkAlpha = resolveFocusDimming(preset, focus);
      }
    } else if (focus.isRoot(sourceId) || focus.isRoot(targetId)) {
      baseLinkColor = theme.linkRootColor;
    }

    addLineBatch(baseBatches, sourceNode, targetNode, baseLinkColor, baseLinkAlpha * lensAlpha, lineWidth);

    if (overlayLinkColor) {
      addLineBatch(overlayBatches, sourceNode, targetNode, overlayLinkColor, overlayLinkAlpha * lensAlpha, lineWidth);
    }
  }

  flushLineBatches(ctx, baseBatches);
  flushLineBatches(ctx, overlayBatches);
}

function isNodeInBounds(node: GraphNode, bounds: WorldBounds, radius: number): boolean {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  return (
    x + radius >= bounds.minX &&
    x - radius <= bounds.maxX &&
    y + radius >= bounds.minY &&
    y - radius <= bounds.maxY
  );
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  viewport: Viewport,
  theme: GraphTheme,
  preset: GraphPreset,
  focus: FocusRenderState,
  bounds: WorldBounds,
  lensVisibilityByNodeId?: Map<string, number>
) {
  ctx.globalAlpha = 1.0;
  const baseBatches = new Map<string, { color: string; alpha: number; lineWidth: number; circles: Circle[] }>();
  const overlayBatches = new Map<string, { color: string; alpha: number; lineWidth: number; circles: Circle[] }>();
  const borderBatches = new Map<string, { color: string; alpha: number; lineWidth: number; circles: Circle[] }>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nodeRadius = getNodeRadius(preset.nodeRadius, preset.nodeSizeScale ?? 1.0, node.size, node.degree);
    if (!isNodeInBounds(node, bounds, nodeRadius)) continue;

    const lensAlpha = resolveLensNodeAlpha(node.id, lensVisibilityByNodeId);
    if (lensAlpha <= 0.001) continue;

    const nodeColor = resolveNodeBaseColor(node, theme, focus);
    let nodeAlpha = 1.0;
    let overlayNodeColor: string | null = null;
    let overlayNodeAlpha = 0;

    if (!focus.isRoot(node.id)) {
      if (focus.isHovered(node.id)) {
        overlayNodeColor = theme.nodeHoverColor;
        overlayNodeAlpha = focus.focusProgress;
      } else if (focus.isSelected(node.id)) {
        overlayNodeColor = theme.nodeSelectedColor;
        overlayNodeAlpha = focus.focusProgress;
      } else if (focus.hasActiveFocus && focus.isNeighbor(node.id)) {
        overlayNodeColor = theme.nodeNeighborColor;
        overlayNodeAlpha = focus.focusProgress;
      } else if (focus.hasActiveFocus && !focus.isNeighbor(node.id)) {
        nodeAlpha = resolveFocusDimming(preset, focus);
      }
    }

    addCircleBatch(baseBatches, node, nodeRadius, nodeColor, nodeAlpha * lensAlpha);

    if (overlayNodeColor && overlayNodeAlpha > 0) {
      addCircleBatch(overlayBatches, node, nodeRadius, overlayNodeColor, overlayNodeAlpha * lensAlpha);
    }

    if (focus.isSelected(node.id) || focus.isHovered(node.id)) {
      addCircleBatch(
        borderBatches,
        node,
        nodeRadius + 1.5 / viewport.scale,
        theme.nodeBorderSelectedColor,
        focus.focusProgress * lensAlpha,
        1.7 / viewport.scale
      );
    } else {
      addCircleBatch(
        borderBatches,
        node,
        nodeRadius,
        theme.nodeBorderColor,
        nodeAlpha * lensAlpha,
        0.8 / viewport.scale
      );
    }
  }

  flushCircleBatches(ctx, baseBatches);
  flushCircleBatches(ctx, overlayBatches);
  flushCircleBatches(ctx, borderBatches, true);
}

function occludeLinksBehindNodes(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  viewport: Viewport,
  theme: GraphTheme,
  preset: GraphPreset,
  bounds: WorldBounds,
  lensVisibilityByNodeId?: Map<string, number>
) {
  const occlusionBatches = new Map<
    string,
    { color: string; alpha: number; lineWidth: number; circles: Circle[] }
  >();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const radius = getNodeRadius(
      preset.nodeRadius,
      preset.nodeSizeScale ?? 1,
      node.size,
      node.degree
    );
    if (!isNodeInBounds(node, bounds, radius)) continue;

    const lensAlpha = resolveLensNodeAlpha(node.id, lensVisibilityByNodeId);
    if (lensAlpha <= 0.001) continue;
    addCircleBatch(occlusionBatches, node, radius, '#000000', lensAlpha);
  }

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  flushCircleBatches(ctx, occlusionBatches);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (const batch of occlusionBatches.values()) batch.color = theme.backgroundColor;
  flushCircleBatches(ctx, occlusionBatches);
  ctx.restore();
}

function resolveLabelColor(node: GraphNode, theme: GraphTheme, focus: FocusRenderState, isNodeNeighbor: boolean) {
  if (focus.isRoot(node.id)) {
    return theme.labelRootColor;
  }
  if (focus.isSelected(node.id)) {
    return theme.labelSelectedColor;
  }
  if (focus.isHovered(node.id)) {
    return theme.labelHoverColor;
  }
  if (isNodeNeighbor) {
    return theme.labelSelectedColor;
  }
  return theme.labelColor;
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  viewport: Viewport,
  theme: GraphTheme,
  preset: GraphPreset,
  focus: FocusRenderState,
  labelVisibilityByNodeId?: Map<string, number>,
  lensVisibilityByNodeId?: Map<string, number>,
  labelRenderBudget?: number,
  labelOrderByNodeId?: Map<string, number>
) {
  ctx.globalAlpha = 1.0;
  ctx.font = `${11 / viewport.scale}px ${theme.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let selectedLabelIds: Set<string> | null = null;
  if (labelRenderBudget !== undefined) {
    const candidates: LabelRenderCandidate[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const lensAlpha = resolveLensNodeAlpha(node.id, lensVisibilityByNodeId);
      if (lensAlpha <= 0.001) continue;

      const isNodeSelected = focus.isSelected(node.id);
      const isNodeHovered = focus.isHovered(node.id);
      const isNodeRoot = focus.isRoot(node.id);
      const isNodeNeighbor = focus.hasActiveFocus && focus.isNeighbor(node.id);
      const forceVisible = isNodeHovered || isNodeSelected || isNodeRoot;
      const labelVisibility = labelVisibilityByNodeId?.get(node.id) ?? resolveLabelVisibilityTarget(
        node.degree,
        viewport.scale,
        preset.labelDensity,
        forceVisible || isNodeNeighbor
      );

      if (labelVisibility <= 0.001) continue;

      candidates.push({
        id: node.id,
        index: labelOrderByNodeId?.get(node.id) ?? i,
        forceVisible,
        isNeighbor: isNodeNeighbor,
        visibility: labelVisibility * lensAlpha,
        degree: Number.isFinite(node.degree) ? Math.max(0, node.degree ?? 0) : 0
      });
    }

    selectedLabelIds = selectLabelNodeIdsForBudget(candidates, labelRenderBudget);
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (selectedLabelIds && !selectedLabelIds.has(node.id)) continue;

    const lensAlpha = resolveLensNodeAlpha(node.id, lensVisibilityByNodeId);
    if (lensAlpha <= 0.001) continue;

    const isNodeSelected = focus.isSelected(node.id);
    const isNodeHovered = focus.isHovered(node.id);
    const isNodeRoot = focus.isRoot(node.id);
    const isNodeNeighbor = focus.hasActiveFocus && focus.isNeighbor(node.id);
    const forceLabelVisible = isNodeHovered || isNodeSelected || isNodeRoot || isNodeNeighbor;
    const labelVisibility = labelVisibilityByNodeId?.get(node.id) ?? resolveLabelVisibilityTarget(
      node.degree,
      viewport.scale,
      preset.labelDensity,
      forceLabelVisible
    );
    if (labelVisibility <= 0.001) continue;

    let labelAlpha = 1.0;
    if (focus.hasActiveFocus && !isNodeHovered && !isNodeSelected && !isNodeRoot && !isNodeNeighbor) {
      labelAlpha = resolveFocusDimming(preset, focus);
    }
    ctx.globalAlpha = labelAlpha * labelVisibility * lensAlpha;

    const nodeRadius = getNodeRadius(preset.nodeRadius, preset.nodeSizeScale ?? 1.0, node.size, node.degree);
    const labelX = node.x ?? 0;
    const labelY = (node.y ?? 0) + nodeRadius + 3.5 / viewport.scale;

    ctx.strokeStyle = theme.backgroundColor;
    ctx.lineWidth = 3.5 / viewport.scale;
    ctx.lineJoin = 'round';
    ctx.strokeText(node.label, labelX, labelY);

    ctx.fillStyle = resolveLabelColor(node, theme, focus, isNodeNeighbor);
    ctx.fillText(node.label, labelX, labelY);
  }
}

/**
 * Draws the entire graph onto a given Canvas context.
 * Performs fast rendering and precise styling depending on highlight states.
 */
export function drawGraph(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: GraphNode[],
  links: GraphLink[],
  viewport: Viewport,
  theme: GraphTheme,
  preset: GraphPreset,
  selectedNodeId: string | null | undefined,
  hoveredNodeId: string | null | undefined,
  rootNodeId: string | null | undefined,
  neighbors: ReadonlySet<string>,
  dimProgress = 1,
  labelVisibilityByNodeId?: Map<string, number>,
  lensVisibilityByNodeId?: Map<string, number>,
  spatialIndex?: GraphSpatialIndex,
  labelRenderBudget?: number
) {
  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.scale, viewport.scale);

  const focus = createFocusRenderState(
    selectedNodeId,
    hoveredNodeId,
    rootNodeId,
    neighbors,
    dimProgress
  );

  const bounds = getPaddedViewportWorldBounds(width, height, viewport);
  const visibleNodes = spatialIndex ? querySpatialIndex(spatialIndex, bounds) : nodes;
  const labelOrderByNodeId = labelRenderBudget === undefined
    ? undefined
    : new Map(nodes.map((node, index) => [node.id, index]));

  drawLinks(ctx, links, viewport, theme, preset, focus, bounds, lensVisibilityByNodeId);
  occludeLinksBehindNodes(
    ctx,
    visibleNodes,
    viewport,
    theme,
    preset,
    bounds,
    lensVisibilityByNodeId
  );
  drawNodes(ctx, visibleNodes, viewport, theme, preset, focus, bounds, lensVisibilityByNodeId);
  drawLabels(
    ctx,
    visibleNodes,
    viewport,
    theme,
    preset,
    focus,
    labelVisibilityByNodeId,
    lensVisibilityByNodeId,
    labelRenderBudget,
    labelOrderByNodeId
  );

  ctx.restore();
}
