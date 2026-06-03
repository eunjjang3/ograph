import { useCallback, useEffect, useRef } from 'react';
import type { GraphNode, GraphViewport } from './types';
import type { Viewport } from './graphMath';

const MIN_ZOOM_SCALE = 0.02;
const MAX_ZOOM_SCALE = 32.0;

type CurrentRef<T> = { current: T };

interface UseViewportControlsParams {
  dimensions: { width: number; height: number };
  activeNodesRef: CurrentRef<GraphNode[]>;
  fitNodeIds: ReadonlySet<string>;
  autoFitDependency: unknown;
  autoFitEnabled: boolean;
  requestRender: () => void;
  onViewportChange?: (viewport: GraphViewport) => void;
}

function resolveGraphCoordinate(value: number | undefined): number | null {
  if (value === undefined) {
    return 0;
  }

  return Number.isFinite(value) ? value : null;
}

function resolveMinimumScale(minimumScale: number): number {
  return Number.isFinite(minimumScale) && minimumScale > 0
    ? minimumScale
    : MIN_ZOOM_SCALE;
}

export function resolveViewportForGraphNodes(
  nodes: GraphNode[],
  dimensions: { width: number; height: number },
  minimumScale = MIN_ZOOM_SCALE
): Viewport | null {
  if (
    nodes.length === 0 ||
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let validNodeCount = 0;

  for (const node of nodes) {
    const x = resolveGraphCoordinate(node.x);
    const y = resolveGraphCoordinate(node.y);

    if (x === null || y === null) {
      continue;
    }

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    validNodeCount += 1;
  }

  if (validNodeCount === 0) {
    return null;
  }

  const graphW = maxX - minX;
  const graphH = maxY - minY;
  const pad = 60;
  let scale = 1.0;

  if (graphW > 0 && graphH > 0) {
    const scaleX = (dimensions.width - pad * 2) / graphW;
    const scaleY = (dimensions.height - pad * 2) / graphH;
    scale = Math.min(scaleX, scaleY);
  }

  scale = Math.max(resolveMinimumScale(minimumScale), Math.min(scale, MAX_ZOOM_SCALE));

  const cx = minX + graphW / 2;
  const cy = minY + graphH / 2;

  return {
    x: dimensions.width / 2 - cx * scale,
    y: dimensions.height / 2 - cy * scale,
    scale
  };
}

export function useViewportControls({
  dimensions,
  activeNodesRef,
  fitNodeIds,
  autoFitDependency,
  autoFitEnabled,
  requestRender,
  onViewportChange
}: UseViewportControlsParams) {
  const viewportRef = useRef<Viewport>({ x: 300, y: 200, scale: 0.8 });
  const targetViewportRef = useRef<Viewport>({ x: 300, y: 200, scale: 0.8 });
  const viewportAnimationActiveRef = useRef<boolean>(false);
  const lastAutoFitDependencyRef = useRef(autoFitDependency);
  const hasAutoFitRef = useRef(false);

  const setViewportImmediate = useCallback((viewport: Viewport) => {
    viewportRef.current = viewport;
    targetViewportRef.current = viewport;
    viewportAnimationActiveRef.current = false;
    requestRender();
    onViewportChange?.(viewportRef.current);
  }, [onViewportChange, requestRender]);

  const animateViewportTo = useCallback((viewport: Viewport) => {
    targetViewportRef.current = viewport;
    viewportAnimationActiveRef.current = true;
    requestRender();
    onViewportChange?.(targetViewportRef.current);
  }, [onViewportChange, requestRender]);

  const resolveViewportForNodes = useCallback((nodes: GraphNode[], minimumScale = MIN_ZOOM_SCALE): Viewport | null => (
    resolveViewportForGraphNodes(nodes, dimensions, minimumScale)
  ), [dimensions]);

  const getFittedNodes = useCallback(() => (
    activeNodesRef.current.filter(node => fitNodeIds.has(node.id))
  ), [activeNodesRef, fitNodeIds]);

  const fitToView = useCallback((minimumScale = MIN_ZOOM_SCALE) => {
    const viewport = resolveViewportForNodes(getFittedNodes(), minimumScale);
    if (viewport) setViewportImmediate(viewport);
  }, [getFittedNodes, resolveViewportForNodes, setViewportImmediate]);

  const animateFitToView = useCallback((minimumScale = MIN_ZOOM_SCALE) => {
    const viewport = resolveViewportForNodes(getFittedNodes(), minimumScale);
    if (viewport) animateViewportTo(viewport);
  }, [animateViewportTo, getFittedNodes, resolveViewportForNodes]);

  const resetViewport = useCallback(() => {
    setViewportImmediate({
      x: dimensions.width / 2,
      y: dimensions.height / 2,
      scale: 1.0
    });
  }, [dimensions, setViewportImmediate]);

  useEffect(() => {
    const dependencyChanged = lastAutoFitDependencyRef.current !== autoFitDependency;
    lastAutoFitDependencyRef.current = autoFitDependency;

    if (
      autoFitEnabled &&
      activeNodesRef.current.length > 0 &&
      (!hasAutoFitRef.current || dependencyChanged)
    ) {
      hasAutoFitRef.current = true;
      const timer = setTimeout(() => {
        fitToView();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [autoFitDependency, autoFitEnabled, fitToView, activeNodesRef]);

  return {
    viewportRef,
    targetViewportRef,
    viewportAnimationActiveRef,
    setViewportImmediate,
    animateViewportTo,
    animateFitToView,
    fitToView,
    resetViewport
  };
}

export { MIN_ZOOM_SCALE, MAX_ZOOM_SCALE };
