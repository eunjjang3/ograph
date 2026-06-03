export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

const LABEL_DENSITY_THRESHOLD_SCALE = 12.0;
const LABEL_IMPORTANCE_SCALE = 2.2;
const MIN_LABEL_REVEAL_WIDTH = 1.2;
const LABEL_REVEAL_WIDTH_RATIO = 0.35;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (value <= edge0) return 0;
  if (value >= edge1) return 1;

  const t = (value - edge0) / (edge1 - edge0);
  return t * t * (3 - 2 * t);
}

export function toWorldX(screenX: number, viewport: Viewport): number {
  return (screenX - viewport.x) / viewport.scale;
}

export function toWorldY(screenY: number, viewport: Viewport): number {
  return (screenY - viewport.y) / viewport.scale;
}

/**
 * Calculates a dynamic size base on degrees or configured sizes,
 * ensuring sizes remain bounded.
 */
export function getNodeRadius(
  baseRadius: number,
  sizeScale: number,
  sizeValue?: number,
  degreeValue?: number
): number {
  // Use metadata size or secondary dynamic sizes
  const sizeMultiplier = sizeValue !== undefined ? sizeValue : 1.0;
  const degreeMultiplier = degreeValue !== undefined ? 1.0 + Math.log1p(degreeValue) * 0.4 : 1.0;
  
  return baseRadius * sizeMultiplier * degreeMultiplier * (sizeScale || 1.0);
}

export function resolveLabelVisibilityTarget(
  degreeValue: number | undefined,
  viewportScale: number,
  labelDensity: number,
  forceVisible: boolean
): number {
  if (forceVisible) return 1;

  const density = clamp01(labelDensity);
  const densityThreshold = (1.0 - density) * LABEL_DENSITY_THRESHOLD_SCALE;
  const degree = Number.isFinite(degreeValue) ? Math.max(0, degreeValue || 0) : 0;
  const scale = Number.isFinite(viewportScale) ? Math.max(0, viewportScale) : 0;
  const nodeImportance = degree * scale * LABEL_IMPORTANCE_SCALE;
  const revealWidth = Math.max(MIN_LABEL_REVEAL_WIDTH, densityThreshold * LABEL_REVEAL_WIDTH_RATIO);
  const revealStart = Math.max(0, densityThreshold - revealWidth * 0.5);
  const revealEnd = densityThreshold + revealWidth * 0.5;

  return smoothstep(revealStart, revealEnd, nodeImportance);
}
