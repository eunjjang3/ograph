import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { RefObject } from 'react';
import type { GraphNode, GraphPreset, GraphViewport } from './types';
import type { Viewport } from './graphMath';
import { findNodeAtPosition } from './hitTest';
import { MAX_ZOOM_SCALE, MIN_ZOOM_SCALE } from './useViewportControls';
import type { GraphSpatialIndex } from './spatialIndex';

const POINTER_DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_STRENGTH = 0.07;

type CurrentRef<T> = { current: T };

export function clampGraphZoomScale(scale: number): number | null {
  if (!Number.isFinite(scale)) {
    return null;
  }

  return Math.max(MIN_ZOOM_SCALE, Math.min(scale, MAX_ZOOM_SCALE));
}

export function resolveAnchoredZoomViewport(
  originX: number,
  originY: number,
  viewport: Viewport,
  nextScaleInput: number
): Viewport | null {
  const nextScale = clampGraphZoomScale(nextScaleInput);

  if (
    nextScale === null ||
    !Number.isFinite(originX) ||
    !Number.isFinite(originY) ||
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.scale) ||
    viewport.scale === 0
  ) {
    return null;
  }

  const worldX = (originX - viewport.x) / viewport.scale;
  const worldY = (originY - viewport.y) / viewport.scale;

  return {
    x: originX - worldX * nextScale,
    y: originY - worldY * nextScale,
    scale: nextScale
  };
}

export function resolveWheelZoomViewport(
  originX: number,
  originY: number,
  viewport: Viewport,
  deltaY: number
): Viewport | null {
  const zoomMultiplier = deltaY < 0
    ? 1 + WHEEL_ZOOM_STRENGTH
    : 1 / (1 + WHEEL_ZOOM_STRENGTH);

  return resolveAnchoredZoomViewport(
    originX,
    originY,
    viewport,
    viewport.scale * zoomMultiplier
  );
}

interface UseGraphPointerInteractionsParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  activeNodesRef: CurrentRef<GraphNode[]>;
  nodeByIdRef: CurrentRef<Map<string, GraphNode>>;
  spatialIndexRef: CurrentRef<GraphSpatialIndex>;
  interactableNodeIds: ReadonlySet<string>;
  viewportRef: CurrentRef<Viewport>;
  targetViewportRef: CurrentRef<Viewport>;
  viewportAnimationActiveRef: CurrentRef<boolean>;
  preset: GraphPreset;
  hoveredNodeId?: string | null;
  requestRender: () => void;
  animateViewportTo: (viewport: Viewport) => void;
  dragStart: (nodeId: string) => void;
  dragMove: (nodeId: string, worldX: number, worldY: number) => void;
  dragEnd: (nodeId: string) => void;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  onNodeDragStart?: (node: GraphNode) => void;
  onNodeDrag?: (node: GraphNode) => void;
  onNodeDragEnd?: (node: GraphNode) => void;
  onViewportChange?: (viewport: GraphViewport) => void;
}

export function useGraphPointerInteractions({
  canvasRef,
  activeNodesRef,
  nodeByIdRef,
  spatialIndexRef,
  interactableNodeIds,
  viewportRef,
  targetViewportRef,
  viewportAnimationActiveRef,
  preset,
  hoveredNodeId,
  requestRender,
  animateViewportTo,
  dragStart,
  dragMove,
  dragEnd,
  onNodeClick,
  onNodeDoubleClick,
  onNodeHover,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragEnd,
  onViewportChange
}: UseGraphPointerInteractionsParams) {
  const hoveredNodeIdRef = useRef<string | null>(null);
  const [localHoveredNodeId, setLocalHoveredNodeId] = useState<string | null>(null);
  const isPanningRef = useRef<boolean>(false);
  const dragNodeRef = useRef<GraphNode | null>(null);
  const isNodeDraggingRef = useRef<boolean>(false);
  const isPointerDownRef = useRef<boolean>(false);
  const pointerDownRef = useRef({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);
  const startPanRef = useRef({ x: 0, y: 0 });
  const startPanViewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1.0 });
  const isPointerMovedRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);
  const lastTouchDistRef = useRef<number | null>(null);
  const interactionActiveRef = useRef<boolean>(false);

  useEffect(() => {
    if (hoveredNodeId !== undefined) {
      hoveredNodeIdRef.current = hoveredNodeId;
      setLocalHoveredNodeId(hoveredNodeId);
      requestRender();
    }
  }, [hoveredNodeId, requestRender]);

  useEffect(() => {
    const currentHoveredNodeId = hoveredNodeIdRef.current;
    if (currentHoveredNodeId && !interactableNodeIds.has(currentHoveredNodeId)) {
      hoveredNodeIdRef.current = null;
      setLocalHoveredNodeId(null);
      onNodeHover?.(null);
      requestRender();
    }
  }, [interactableNodeIds, onNodeHover, requestRender]);

  const clearHoveredNode = useCallback(() => {
    if (hoveredNodeIdRef.current === null) return;

    hoveredNodeIdRef.current = null;
    setLocalHoveredNodeId(null);
    onNodeHover?.(null);
    requestRender();
  }, [onNodeHover, requestRender]);
  const clearHoveredNodeRef = useRef(clearHoveredNode);
  clearHoveredNodeRef.current = clearHoveredNode;
  const requestRenderRef = useRef(requestRender);
  requestRenderRef.current = requestRender;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const clearHoverOutsideCanvas = (event: PointerEvent | MouseEvent) => {
      if (hoveredNodeIdRef.current === null || isPointerDownRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const isInsideCanvas =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInsideCanvas) {
        clearHoveredNode();
      }
    };

    window.addEventListener('pointermove', clearHoverOutsideCanvas);
    window.addEventListener('mousemove', clearHoverOutsideCanvas);

    return () => {
      window.removeEventListener('pointermove', clearHoverOutsideCanvas);
      window.removeEventListener('mousemove', clearHoverOutsideCanvas);
    };
  }, [canvasRef, clearHoveredNode]);

  const getNodeAtEventPosition = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { node: null, mouseX: 0, mouseY: 0 };

    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const node = findNodeAtPosition(
      activeNodesRef.current,
      mouseX,
      mouseY,
      viewportRef.current,
      preset.nodeRadius,
      preset.nodeSizeScale || 1.0,
      spatialIndexRef.current,
      interactableNodeIds
    );

    return { node, mouseX, mouseY };
  }, [
    activeNodesRef,
    canvasRef,
    interactableNodeIds,
    preset.nodeRadius,
    preset.nodeSizeScale,
    spatialIndexRef,
    viewportRef
  ]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    const { node: clickedNode } = getNodeAtEventPosition(e.clientX, e.clientY);

    isPointerMovedRef.current = false;
    isPointerDownRef.current = true;
    interactionActiveRef.current = true;
    activePointerIdRef.current = e.pointerId;
    pointerDownRef.current = { x: e.clientX, y: e.clientY };

    if (clickedNode) {
      dragNodeRef.current = clickedNode;
    } else {
      isPanningRef.current = true;
      startPanRef.current = { x: e.clientX, y: e.clientY };
      startPanViewportRef.current = { ...viewportRef.current };
    }
    requestRender();
  }, [canvasRef, getNodeAtEventPosition, requestRender, viewportRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { node: hovered, mouseX, mouseY } = getNodeAtEventPosition(e.clientX, e.clientY);

    if (
      isPointerDownRef.current &&
      !isPointerMovedRef.current &&
      Math.hypot(e.clientX - pointerDownRef.current.x, e.clientY - pointerDownRef.current.y) >= POINTER_DRAG_THRESHOLD_PX
    ) {
      isPointerMovedRef.current = true;
    }

    if (dragNodeRef.current) {
      if (!isPointerMovedRef.current) {
        return;
      }

      if (!isNodeDraggingRef.current) {
        isNodeDraggingRef.current = true;
        dragStart(dragNodeRef.current.id);
        onNodeDragStart?.(dragNodeRef.current);
      }

      const worldX = (mouseX - viewportRef.current.x) / viewportRef.current.scale;
      const worldY = (mouseY - viewportRef.current.y) / viewportRef.current.scale;

      dragMove(dragNodeRef.current.id, worldX, worldY);
      onNodeDrag?.(dragNodeRef.current);
      requestRender();
      return;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - startPanRef.current.x;
      const dy = e.clientY - startPanRef.current.y;

      viewportRef.current = {
        x: startPanViewportRef.current.x + dx,
        y: startPanViewportRef.current.y + dy,
        scale: startPanViewportRef.current.scale
      };
      targetViewportRef.current = viewportRef.current;
      viewportAnimationActiveRef.current = false;

      requestRender();
      onViewportChange?.(viewportRef.current);
      return;
    }

    const oldHov = hoveredNodeIdRef.current;
    const newHov = hovered ? hovered.id : null;

    if (oldHov !== newHov) {
      hoveredNodeIdRef.current = newHov;
      setLocalHoveredNodeId(newHov);
      onNodeHover?.(hovered || null);
      requestRender();
    }
  }, [
    canvasRef,
    getNodeAtEventPosition,
    dragStart,
    dragMove,
    onNodeDragStart,
    onNodeDrag,
    onNodeHover,
    onViewportChange,
    requestRender,
    targetViewportRef,
    viewportAnimationActiveRef,
    viewportRef
  ]);

  const releaseActiveDrag = useCallback((notifyConsumer = true) => {
    if (dragNodeRef.current && isNodeDraggingRef.current) {
      dragEnd(dragNodeRef.current.id);
      if (notifyConsumer) {
        onNodeDragEnd?.(dragNodeRef.current);
      }
    }

    dragNodeRef.current = null;
    isNodeDraggingRef.current = false;
  }, [dragEnd, onNodeDragEnd]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const { node: clickedNode } = getNodeAtEventPosition(e.clientX, e.clientY);

    releaseActiveDrag();
    isPanningRef.current = false;
    isPointerDownRef.current = false;
    interactionActiveRef.current = lastTouchDistRef.current !== null;
    activePointerIdRef.current = null;

    if (clickedNode && !isPointerMovedRef.current) {
      const now = Date.now();
      const doubleClickThreshold = 260;

      if (now - lastClickTimeRef.current < doubleClickThreshold) {
        onNodeDoubleClick?.(clickedNode);
      } else {
        onNodeClick?.(clickedNode);
      }
      lastClickTimeRef.current = now;
    }

    isPointerMovedRef.current = false;
    requestRender();
  }, [canvasRef, getNodeAtEventPosition, onNodeClick, onNodeDoubleClick, releaseActiveDrag, requestRender]);

  const resetPointerState = useCallback((notifyConsumer = true) => {
    releaseActiveDrag(notifyConsumer);
    isPanningRef.current = false;
    isPointerDownRef.current = false;
    interactionActiveRef.current = false;
    activePointerIdRef.current = null;
    isPointerMovedRef.current = false;
    lastTouchDistRef.current = null;
  }, [releaseActiveDrag]);
  const resetPointerStateRef = useRef(resetPointerState);
  resetPointerStateRef.current = resetPointerState;

  // Unmount cleanup only. Drag telemetry callbacks can re-render the parent
  // during an active drag, and that must not release graph-owned drag state.
  useEffect(() => {
    return () => {
      resetPointerStateRef.current(false);
      hoveredNodeIdRef.current = null;
    };
  }, []);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    resetPointerState();
    clearHoveredNode();
    requestRender();
  }, [canvasRef, clearHoveredNode, requestRender, resetPointerState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const releaseIfCanvasMissedEnd = (event: PointerEvent | MouseEvent) => {
      if (!isPointerDownRef.current) return;
      const isDifferentPointer =
        'pointerId' in event &&
        activePointerIdRef.current !== null &&
        event.pointerId !== activePointerIdRef.current;

      if (isDifferentPointer) {
        return;
      }

      resetPointerStateRef.current();
      clearHoveredNodeRef.current();
      requestRenderRef.current();
    };

    window.addEventListener('pointerup', releaseIfCanvasMissedEnd);
    window.addEventListener('pointercancel', releaseIfCanvasMissedEnd);
    window.addEventListener('mouseup', releaseIfCanvasMissedEnd);

    return () => {
      window.removeEventListener('pointerup', releaseIfCanvasMissedEnd);
      window.removeEventListener('pointercancel', releaseIfCanvasMissedEnd);
      window.removeEventListener('mouseup', releaseIfCanvasMissedEnd);
    };
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (!isPointerDownRef.current) {
      clearHoveredNode();
    }
  }, [clearHoveredNode]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const nextViewport = resolveWheelZoomViewport(
      mouseX,
      mouseY,
      targetViewportRef.current,
      e.deltaY
    );

    if (nextViewport) {
      animateViewportTo(nextViewport);
    }
  }, [animateViewportTo, canvasRef, targetViewportRef]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && canvasRef.current) {
      e.preventDefault();
      interactionActiveRef.current = true;
      const rect = canvasRef.current.getBoundingClientRect();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      if (lastTouchDistRef.current !== null) {
        const cx = (t1.clientX + t2.clientX) / 2 - rect.left;
        const cy = (t1.clientY + t2.clientY) / 2 - rect.top;
        const zoomOriginViewport = targetViewportRef.current;
        const ratio = dist / lastTouchDistRef.current;
        const nextViewport = resolveAnchoredZoomViewport(
          cx,
          cy,
          zoomOriginViewport,
          zoomOriginViewport.scale * ratio
        );

        if (nextViewport) {
          animateViewportTo(nextViewport);
        }
      }
      lastTouchDistRef.current = dist;
    }
  }, [animateViewportTo, canvasRef, targetViewportRef]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDistRef.current = null;
    interactionActiveRef.current = isPointerDownRef.current;
    requestRender();
  }, [requestRender]);

  const hoveredNode = localHoveredNodeId ? nodeByIdRef.current.get(localHoveredNodeId) : null;

  return {
    hoveredNodeIdRef,
    interactionActiveRef,
    localHoveredNodeId,
    hoveredNode,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerLeave,
      onMouseLeave: handlePointerLeave,
      onPointerCancel: handlePointerCancel,
      onWheel: handleWheel,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    }
  };
}
