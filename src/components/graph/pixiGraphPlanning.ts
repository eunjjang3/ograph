import type { GraphNode } from './types';
import type { Viewport } from './graphMath';
import { getPaddedViewportWorldBounds, querySpatialIndex, type GraphSpatialIndex } from './spatialIndex';

export interface PixiLabelCandidate {
  id: string;
  inputIndex: number;
  visibility: number;
  degree: number;
  forceVisible: boolean;
  isNeighbor: boolean;
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
