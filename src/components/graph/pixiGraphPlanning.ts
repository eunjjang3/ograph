import type { GraphLink, GraphNode } from './types';
import type { Viewport } from './graphMath';
import { getLinkId } from './localGraph';
import { getPaddedViewportWorldBounds, querySpatialIndex, type GraphSpatialIndex } from './spatialIndex';

export interface PixiLabelCandidate {
  id: string;
  inputIndex: number;
  visibility: number;
  degree: number;
  forceVisible: boolean;
  isNeighbor: boolean;
}

export function hasEquivalentPixiTopology(
  previousNodes: readonly GraphNode[] | null,
  previousLinks: readonly GraphLink[] | null,
  nextNodes: readonly GraphNode[],
  nextLinks: readonly GraphLink[]
): boolean {
  if (
    !previousNodes ||
    !previousLinks ||
    previousNodes.length !== nextNodes.length ||
    previousLinks.length !== nextLinks.length
  ) {
    return false;
  }

  for (let index = 0; index < nextNodes.length; index += 1) {
    if (previousNodes[index]!.id !== nextNodes[index]!.id) return false;
  }

  for (let index = 0; index < nextLinks.length; index += 1) {
    const previous = previousLinks[index]!;
    const next = nextLinks[index]!;
    if (
      getLinkId(previous.source) !== getLinkId(next.source) ||
      getLinkId(previous.target) !== getLinkId(next.target)
    ) {
      return false;
    }
  }

  return true;
}

export interface RemappedPixiTopology<TLinkView> {
  nodeById: Map<string, GraphNode>;
  pendingNodes: GraphNode[];
  pendingLinks: GraphLink[];
  linkViews: Map<GraphLink, TLinkView>;
}

// Worker startup replaces the input graph objects with simulation-backed objects.
// Keep retained Pixi views and unfinished materialization queues aligned by ID/order.
export function remapEquivalentPixiTopology<TLinkView>(
  previousNodes: readonly GraphNode[] | null,
  previousLinks: readonly GraphLink[] | null,
  nextNodes: readonly GraphNode[],
  nextLinks: readonly GraphLink[],
  pendingNodes: readonly GraphNode[],
  pendingLinks: readonly GraphLink[],
  linkViews: ReadonlyMap<GraphLink, TLinkView>
): RemappedPixiTopology<TLinkView> | null {
  if (!hasEquivalentPixiTopology(previousNodes, previousLinks, nextNodes, nextLinks)) {
    return null;
  }

  const nodeById = new Map(nextNodes.map(node => [node.id, node]));
  const remappedPendingNodes: GraphNode[] = [];
  for (const node of pendingNodes) {
    const nextNode = nodeById.get(node.id);
    if (!nextNode) return null;
    remappedPendingNodes.push(nextNode);
  }

  const remappedLinkViews = new Map<GraphLink, TLinkView>();
  const nextLinkByPrevious = pendingLinks.length > 0
    ? new Map<GraphLink, GraphLink>()
    : null;

  for (let index = 0; index < nextLinks.length; index += 1) {
    const previousLink = previousLinks![index]!;
    const nextLink = nextLinks[index]!;
    nextLinkByPrevious?.set(previousLink, nextLink);
    const view = linkViews.get(previousLink);
    if (view !== undefined) remappedLinkViews.set(nextLink, view);
  }
  if (remappedLinkViews.size !== linkViews.size) return null;

  const remappedPendingLinks: GraphLink[] = [];
  for (const link of pendingLinks) {
    const nextLink = nextLinkByPrevious!.get(link);
    if (!nextLink) return null;
    remappedPendingLinks.push(nextLink);
  }

  return {
    nodeById,
    pendingNodes: remappedPendingNodes,
    pendingLinks: remappedPendingLinks,
    linkViews: remappedLinkViews
  };
}

export function prioritizePixiNodeMaterialization(
  nodes: readonly GraphNode[],
  spatialIndex: GraphSpatialIndex,
  width: number,
  height: number,
  viewport: Viewport
): GraphNode[] {
  const visibleNodes = querySpatialIndex(
    spatialIndex,
    getPaddedViewportWorldBounds(width, height, viewport)
  );
  const visibleIds = new Set(visibleNodes.map(node => node.id));
  const worldCenterX = (width * 0.5 - viewport.x) / viewport.scale;
  const worldCenterY = (height * 0.5 - viewport.y) / viewport.scale;

  return [...nodes].sort((left, right) => {
    const leftVisible = visibleIds.has(left.id);
    const rightVisible = visibleIds.has(right.id);
    if (leftVisible !== rightVisible) return leftVisible ? -1 : 1;

    const leftDistance = Math.hypot((left.x ?? 0) - worldCenterX, (left.y ?? 0) - worldCenterY);
    const rightDistance = Math.hypot((right.x ?? 0) - worldCenterX, (right.y ?? 0) - worldCenterY);
    return leftDistance - rightDistance;
  });
}

export function selectPixiLabelNodeIds(
  candidates: readonly PixiLabelCandidate[],
  budget: number
): Set<string> {
  const normalizedBudget = Math.max(0, Math.floor(budget));
  const forcedCandidates = candidates.filter(candidate => candidate.forceVisible);
  const selected = new Set(forcedCandidates.map(candidate => candidate.id));
  const remainingSlots = Math.max(0, normalizedBudget - selected.size);

  const ranked = candidates
    .filter(candidate => !candidate.forceVisible)
    .sort((left, right) => {
      if (left.isNeighbor !== right.isNeighbor) return left.isNeighbor ? -1 : 1;
      if (left.visibility !== right.visibility) return right.visibility - left.visibility;
      if (left.degree !== right.degree) return right.degree - left.degree;
      return left.inputIndex - right.inputIndex;
    });

  for (let index = 0; index < Math.min(remainingSlots, ranked.length); index += 1) {
    selected.add(ranked[index]!.id);
  }

  return selected;
}
