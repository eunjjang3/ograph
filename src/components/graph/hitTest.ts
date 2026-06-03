import type { GraphNode } from './types';
import type { Viewport } from './graphMath';
import { getNodeRadius, toWorldX, toWorldY } from './graphMath';
import { querySpatialIndex, type GraphSpatialIndex } from './spatialIndex';

const MIN_HIT_RADIUS_SCREEN = 10;

/**
 * Optimized hit-testing to check if a pointer coordinate is hovering/clicking a node.
 * Uses squared-distance to bypass expensive square-root operations, ensuring high performance.
 */
export function canHitTestViewport(clientX: number, clientY: number, viewport: Viewport): boolean {
  return (
    Number.isFinite(clientX) &&
    Number.isFinite(clientY) &&
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.scale) &&
    viewport.scale > 0
  );
}

export function findNodeAtPosition(
  nodes: GraphNode[],
  clientX: number,
  clientY: number,
  viewport: Viewport,
  baseRadius: number,
  sizeScale: number,
  spatialIndex?: GraphSpatialIndex,
  interactableNodeIds?: ReadonlySet<string>
): GraphNode | null {
  if (!canHitTestViewport(clientX, clientY, viewport)) {
    return null;
  }

  // Convert screen pixels to world coordinate space
  const worldX = toWorldX(clientX, viewport);
  const worldY = toWorldY(clientY, viewport);
  
  let closestNode: GraphNode | null = null;
  let minDistanceSq = Infinity;
  
  // Touch / click targets should feel generous (at least 8-12px padding in screen space)
  const minHitRadiusWorld = MIN_HIT_RADIUS_SCREEN / viewport.scale;
  const spatialQueryRadius = spatialIndex
    ? Math.max(minHitRadiusWorld, spatialIndex.cellSize)
    : minHitRadiusWorld;
  const candidates = spatialIndex
    ? querySpatialIndex(spatialIndex, {
        minX: worldX - spatialQueryRadius,
        maxX: worldX + spatialQueryRadius,
        minY: worldY - spatialQueryRadius,
        maxY: worldY + spatialQueryRadius
      })
    : nodes;
  
  for (let i = 0; i < candidates.length; i++) {
    const node = candidates[i];
    if (interactableNodeIds && !interactableNodeIds.has(node.id)) continue;
    const nx = node.x ?? 0;
    const ny = node.y ?? 0;

    if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
      continue;
    }
    
    const dx = nx - worldX;
    const dy = ny - worldY;
    
    // Quick bounding box check
    const r = getNodeRadius(baseRadius, sizeScale, node.size, node.degree);
    const hitRadius = Math.max(r, minHitRadiusWorld);
    
    if (Math.abs(dx) > hitRadius || Math.abs(dy) > hitRadius) {
      continue;
    }
    
    const distanceSq = dx * dx + dy * dy;
    const hitRadiusSq = hitRadius * hitRadius;
    
    if (distanceSq <= hitRadiusSq) {
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestNode = node;
      }
    }
  }
  
  return closestNode;
}
