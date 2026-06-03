import type { GraphLink, GraphNode } from './types';

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GraphSpatialIndex {
  cellSize: number;
  cells: Map<string, GraphNode[]>;
}

export const DEFAULT_SPATIAL_CELL_SIZE = 96;
export const VIEWPORT_CULLING_BUFFER_PX = 80;

function getEmptyWorldBounds(): WorldBounds {
  return { minX: 0, maxX: -1, minY: 0, maxY: -1 };
}

function isFiniteWorldBounds(bounds: WorldBounds): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxY)
  );
}

function isQueryableWorldBounds(bounds: WorldBounds): boolean {
  return isFiniteWorldBounds(bounds) && bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY;
}

function getCellCoordinate(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

function getCellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export function buildSpatialIndex(
  nodes: GraphNode[],
  cellSize = DEFAULT_SPATIAL_CELL_SIZE
): GraphSpatialIndex {
  const safeCellSize = Number.isFinite(cellSize) && cellSize > 0
    ? cellSize
    : DEFAULT_SPATIAL_CELL_SIZE;
  const cells = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const nodeX = node.x ?? 0;
    const nodeY = node.y ?? 0;

    if (!Number.isFinite(nodeX) || !Number.isFinite(nodeY)) {
      continue;
    }

    const cellX = getCellCoordinate(nodeX, safeCellSize);
    const cellY = getCellCoordinate(nodeY, safeCellSize);
    const key = getCellKey(cellX, cellY);
    const bucket = cells.get(key);

    if (bucket) {
      bucket.push(node);
    } else {
      cells.set(key, [node]);
    }
  }

  return { cellSize: safeCellSize, cells };
}

export function querySpatialIndex(
  index: GraphSpatialIndex,
  bounds: WorldBounds
): GraphNode[] {
  if (
    !Number.isFinite(index.cellSize) ||
    index.cellSize <= 0 ||
    !isQueryableWorldBounds(bounds)
  ) {
    return [];
  }

  const nodes: GraphNode[] = [];
  const minCellX = getCellCoordinate(bounds.minX, index.cellSize);
  const maxCellX = getCellCoordinate(bounds.maxX, index.cellSize);
  const minCellY = getCellCoordinate(bounds.minY, index.cellSize);
  const maxCellY = getCellCoordinate(bounds.maxY, index.cellSize);

  for (let x = minCellX; x <= maxCellX; x++) {
    for (let y = minCellY; y <= maxCellY; y++) {
      const bucket = index.cells.get(getCellKey(x, y));
      if (bucket) nodes.push(...bucket);
    }
  }

  return nodes;
}

export function getPaddedViewportWorldBounds(
  width: number,
  height: number,
  viewport: { x: number; y: number; scale: number },
  bufferPx = VIEWPORT_CULLING_BUFFER_PX
): WorldBounds {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.scale) ||
    !Number.isFinite(bufferPx) ||
    width < 0 ||
    height < 0 ||
    viewport.scale <= 0 ||
    bufferPx < 0
  ) {
    return getEmptyWorldBounds();
  }

  return {
    minX: (-viewport.x - bufferPx) / viewport.scale,
    maxX: (width - viewport.x + bufferPx) / viewport.scale,
    minY: (-viewport.y - bufferPx) / viewport.scale,
    maxY: (height - viewport.y + bufferPx) / viewport.scale
  };
}

function isPointInBounds(x: number, y: number, bounds: WorldBounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

function resolveWorldCoordinate(value: number | undefined): number | null {
  if (value === undefined) {
    return 0;
  }

  return Number.isFinite(value) ? value : null;
}

function doesSegmentBoundsOverlapViewport(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  bounds: WorldBounds
): boolean {
  return (
    Math.max(sourceX, targetX) >= bounds.minX &&
    Math.min(sourceX, targetX) <= bounds.maxX &&
    Math.max(sourceY, targetY) >= bounds.minY &&
    Math.min(sourceY, targetY) <= bounds.maxY
  );
}

function doSegmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const determinant = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (determinant === 0) return false;

  const lambda = ((dy - cy) * (dx - ax) + (cx - dx) * (dy - ay)) / determinant;
  const gamma = ((ay - by) * (dx - ax) + (bx - ax) * (dy - ay)) / determinant;
  return lambda >= 0 && lambda <= 1 && gamma >= 0 && gamma <= 1;
}

export function isLinkInBounds(link: GraphLink, bounds: WorldBounds): boolean {
  if (typeof link.source !== 'object' || typeof link.target !== 'object') {
    return false;
  }

  if (!isQueryableWorldBounds(bounds)) {
    return false;
  }

  const sourceX = resolveWorldCoordinate(link.source.x);
  const sourceY = resolveWorldCoordinate(link.source.y);
  const targetX = resolveWorldCoordinate(link.target.x);
  const targetY = resolveWorldCoordinate(link.target.y);

  if (sourceX === null || sourceY === null || targetX === null || targetY === null) {
    return false;
  }

  if (!doesSegmentBoundsOverlapViewport(sourceX, sourceY, targetX, targetY, bounds)) {
    return false;
  }

  if (
    isPointInBounds(sourceX, sourceY, bounds) ||
    isPointInBounds(targetX, targetY, bounds)
  ) {
    return true;
  }

  return (
    doSegmentsIntersect(sourceX, sourceY, targetX, targetY, bounds.minX, bounds.minY, bounds.maxX, bounds.minY) ||
    doSegmentsIntersect(sourceX, sourceY, targetX, targetY, bounds.maxX, bounds.minY, bounds.maxX, bounds.maxY) ||
    doSegmentsIntersect(sourceX, sourceY, targetX, targetY, bounds.maxX, bounds.maxY, bounds.minX, bounds.maxY) ||
    doSegmentsIntersect(sourceX, sourceY, targetX, targetY, bounds.minX, bounds.maxY, bounds.minX, bounds.minY)
  );
}
