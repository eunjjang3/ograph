import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { GraphLink, GraphNode, GraphPreset, GraphTheme } from './types';
import { resolveLabelVisibilityTarget, type Viewport } from './graphMath';
import { resolveLabelRenderBudget } from './canvasRenderer';
import { getFocusedNeighborSet } from './graphIndexes';
import { buildSpatialIndex, type GraphSpatialIndex } from './spatialIndex';
import type { GraphRendererBackend } from './graphRenderer';
import type { GraphRuntimeTelemetryRef } from './graphRuntime';
import type { GraphSimulationActivity } from './useGraphSimulation';

declare const __OGRAPH_DEBUG_RUNTIME__: boolean;

const VIEWPORT_SMOOTHING = 18;
const DIMMING_SMOOTHING = 14;
const LABEL_SMOOTHING = 12;
const LENS_VISIBILITY_SMOOTHING = 14;
const ANIMATION_EPSILON = 0.001;

type CurrentRef<T> = { current: T };
type D3SimulationActivitySnapshot = {
  alpha: () => number;
  alphaMin: () => number;
};
type SimulationActivitySnapshot = D3SimulationActivitySnapshot | GraphSimulationActivity;

interface UseGraphRenderLoopParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasSizeRef: CurrentRef<{ width: number; height: number; dpr: number }>;
  renderRequestedRef: CurrentRef<boolean>;
  drawFrameRef: CurrentRef<(timestamp: number) => void>;
  scheduleFrame: () => void;
  requestRender: () => void;
  simulationActivityRef: CurrentRef<GraphSimulationActivity | null>;
  rendererBackendRef: CurrentRef<GraphRendererBackend | null>;
  runtimeTelemetryRef?: GraphRuntimeTelemetryRef;
  renderNodesRef: CurrentRef<GraphNode[]>;
  renderLinksRef: CurrentRef<GraphLink[]>;
  neighborsMapRef: CurrentRef<Map<string, Set<string>>>;
  spatialIndexRef: CurrentRef<GraphSpatialIndex>;
  viewportRef: CurrentRef<Viewport>;
  targetViewportRef: CurrentRef<Viewport>;
  viewportAnimationActiveRef: CurrentRef<boolean>;
  hoveredNodeIdRef: CurrentRef<string | null>;
  interactionActiveRef: CurrentRef<boolean>;
  selectedNodeId: string | null | undefined;
  rootNodeId: string | null | undefined;
  lensVisibleNodeIds: ReadonlySet<string>;
  sourceNodeIds: ReadonlySet<string>;
  simulationPaused: boolean;
  reduceMotion: boolean;
  preset: GraphPreset;
  theme: GraphTheme;
  onError?: (error: Error) => void;
}

function toGraphError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}

export function shouldRefreshSpatialIndexForFrame(
  lastIndexedNodes: readonly GraphNode[] | null,
  currentNodes: readonly GraphNode[],
  isSimulationActive: boolean,
  renderRequested: boolean
): boolean {
  return isSimulationActive || renderRequested || lastIndexedNodes !== currentNodes;
}

export function isGraphSimulationActiveForFrame(
  simulation: SimulationActivitySnapshot | null,
  simulationPaused: boolean
): boolean {
  if (simulationPaused || !simulation) return false;

  if ('isActive' in simulation) {
    return simulation.isActive();
  }

  return simulation.alpha() > simulation.alphaMin();
}

export function useGraphRenderLoop({
  canvasRef,
  canvasSizeRef,
  renderRequestedRef,
  drawFrameRef,
  scheduleFrame,
  requestRender,
  simulationActivityRef,
  rendererBackendRef,
  runtimeTelemetryRef,
  renderNodesRef,
  renderLinksRef,
  neighborsMapRef,
  spatialIndexRef,
  viewportRef,
  targetViewportRef,
  viewportAnimationActiveRef,
  hoveredNodeIdRef,
  interactionActiveRef,
  selectedNodeId,
  rootNodeId,
  lensVisibleNodeIds,
  sourceNodeIds,
  simulationPaused,
  reduceMotion,
  preset,
  theme,
  onError
}: UseGraphRenderLoopParams) {
  const dimProgressRef = useRef<number>(0);
  const dimTargetRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const labelVisibilityRef = useRef<Map<string, number>>(new Map());
  const lensVisibilityRef = useRef<Map<string, number>>(new Map());
  const lensVisibilityInitializedRef = useRef<boolean>(false);
  const lensVisibilityDirtyRef = useRef<boolean>(true);
  const lastLensNodesRef = useRef<GraphNode[] | null>(null);
  const lastSpatialIndexNodesRef = useRef<GraphNode[] | null>(null);
  const displayedFocusRef = useRef<{ selectedId: string | null | undefined; hoveredId: string | null | undefined }>({
    selectedId: null,
    hoveredId: null
  });
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    for (const nodeId of lensVisibilityRef.current.keys()) {
      if (!sourceNodeIds.has(nodeId)) {
        lensVisibilityRef.current.delete(nodeId);
      }
    }
    lensVisibilityDirtyRef.current = true;
    requestRender();
  }, [lensVisibleNodeIds, requestRender, sourceNodeIds]);

  useEffect(() => {
    drawFrameRef.current = (timestamp: number) => {
      try {
        const previousFrameTime = lastFrameTimeRef.current;
        const deltaSeconds = previousFrameTime === null
          ? 1 / 60
          : Math.min(0.05, Math.max(0, (timestamp - previousFrameTime) / 1000));
        lastFrameTimeRef.current = timestamp;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const { dpr, width: dw, height: dh } = canvasSizeRef.current;
        if (dw === 0 || dh === 0 || dpr === 0) return;

        const simulation = simulationActivityRef.current;
        const isSimulationActive = isGraphSimulationActiveForFrame(simulation, simulationPaused);
        if (__OGRAPH_DEBUG_RUNTIME__ && runtimeTelemetryRef) {
          runtimeTelemetryRef.current.simulationActive = isSimulationActive;
        }
        const renderNodes = renderNodesRef.current;
        const renderLinks = renderLinksRef.current;
      if (lastLensNodesRef.current !== renderNodes) {
        lastLensNodesRef.current = renderNodes;
        lensVisibilityDirtyRef.current = true;
      }
      if (
        shouldRefreshSpatialIndexForFrame(
          lastSpatialIndexNodesRef.current,
          renderNodes,
          isSimulationActive,
          renderRequestedRef.current
        )
      ) {
        spatialIndexRef.current = buildSpatialIndex(renderNodes);
        lastSpatialIndexNodesRef.current = renderNodes;
      }

      const hoveredId = hoveredNodeIdRef.current;
      const hasFocus = !!hoveredId || !!selectedNodeId;
      if (hasFocus) {
        displayedFocusRef.current = { selectedId: selectedNodeId, hoveredId };
      }
      dimTargetRef.current = hasFocus ? 1 : 0;

      let isDimmingActive = false;
      let dimmingChanged = false;
      if (Math.abs(dimProgressRef.current - dimTargetRef.current) > ANIMATION_EPSILON) {
        dimmingChanged = true;
        const blend = 1 - Math.exp(-DIMMING_SMOOTHING * deltaSeconds);
        dimProgressRef.current += (dimTargetRef.current - dimProgressRef.current) * blend;

        if (Math.abs(dimProgressRef.current - dimTargetRef.current) <= ANIMATION_EPSILON) {
          dimProgressRef.current = dimTargetRef.current;
        } else {
          isDimmingActive = true;
        }
      }

      if (viewportAnimationActiveRef.current) {
        const viewport = viewportRef.current;
        const target = targetViewportRef.current;
        const blend = 1 - Math.exp(-VIEWPORT_SMOOTHING * deltaSeconds);

        viewportRef.current = {
          x: viewport.x + (target.x - viewport.x) * blend,
          y: viewport.y + (target.y - viewport.y) * blend,
          scale: viewport.scale + (target.scale - viewport.scale) * blend
        };

        if (
          Math.abs(viewportRef.current.x - target.x) <= ANIMATION_EPSILON &&
          Math.abs(viewportRef.current.y - target.y) <= ANIMATION_EPSILON &&
          Math.abs(viewportRef.current.scale - target.scale) <= ANIMATION_EPSILON
        ) {
          viewportRef.current = target;
          viewportAnimationActiveRef.current = false;
        }
      }

      const displayedFocus = hasFocus || dimProgressRef.current > 0
        ? displayedFocusRef.current
        : { selectedId: null, hoveredId: null };
      const renderSelectedId = displayedFocus.selectedId;
      const renderHoveredId = displayedFocus.hoveredId;
      const focusId = renderHoveredId || renderSelectedId;
      const activeNeighbors = getFocusedNeighborSet(focusId, neighborsMapRef.current);

      let isLensAnimationActive = false;
      let lensVisibilityChanged = false;
      const lensVisibilityByNodeId = lensVisibilityRef.current;
      const blendLensVisibility = 1 - Math.exp(-LENS_VISIBILITY_SMOOTHING * deltaSeconds);

      if (!lensVisibilityInitializedRef.current) {
        for (const node of renderNodes) {
          lensVisibilityByNodeId.set(node.id, lensVisibleNodeIds.has(node.id) ? 1 : 0);
        }
        lensVisibilityInitializedRef.current = true;
        lensVisibilityDirtyRef.current = false;
      } else if (lensVisibilityDirtyRef.current) {
        lensVisibilityDirtyRef.current = false;

        for (const node of renderNodes) {
          const target = lensVisibleNodeIds.has(node.id) ? 1 : 0;
          const current = lensVisibilityByNodeId.get(node.id) ?? 0;

          if (Math.abs(current - target) <= ANIMATION_EPSILON) {
            lensVisibilityByNodeId.set(node.id, target);
            continue;
          }

          lensVisibilityChanged = true;
          const next = reduceMotion
            ? target
            : current + (target - current) * blendLensVisibility;

          if (Math.abs(next - target) <= ANIMATION_EPSILON) {
            lensVisibilityByNodeId.set(node.id, target);
          } else {
            lensVisibilityByNodeId.set(node.id, next);
            lensVisibilityDirtyRef.current = true;
            isLensAnimationActive = true;
          }
        }
      }

      let isLabelAnimationActive = false;
      let labelsChanged = false;
      const visibleLabelIds = labelVisibilityRef.current;
      const blendLabels = 1 - Math.exp(-LABEL_SMOOTHING * deltaSeconds);

      for (let i = 0; i < renderNodes.length; i++) {
        const node = renderNodes[i]!;
        const isNodeFocused =
          node.id === renderHoveredId ||
          node.id === renderSelectedId ||
          node.id === rootNodeId ||
          !!(focusId && activeNeighbors.has(node.id));
        const target = resolveLabelVisibilityTarget(
          node.degree,
          viewportRef.current.scale,
          preset.labelDensity,
          isNodeFocused
        );
        const current = visibleLabelIds.get(node.id) ?? 0;

        if (Math.abs(current - target) <= ANIMATION_EPSILON) {
          if (target > ANIMATION_EPSILON) {
            visibleLabelIds.set(node.id, target);
          } else {
            visibleLabelIds.delete(node.id);
          }
          continue;
        }

        labelsChanged = true;
        const next = current + (target - current) * blendLabels;

        if (Math.abs(next - target) <= ANIMATION_EPSILON) {
          if (target > ANIMATION_EPSILON) {
            visibleLabelIds.set(node.id, target);
          } else {
            visibleLabelIds.delete(node.id);
          }
        } else {
          if (next > ANIMATION_EPSILON) {
            visibleLabelIds.set(node.id, next);
          } else {
            visibleLabelIds.delete(node.id);
          }
          isLabelAnimationActive = true;
        }
      }

      const shouldDraw =
        renderRequestedRef.current ||
        isSimulationActive ||
        dimmingChanged ||
        lensVisibilityChanged ||
        labelsChanged ||
        viewportAnimationActiveRef.current;

      if (shouldDraw) {
        renderRequestedRef.current = false;
        const isInteractionFrame =
          interactionActiveRef.current ||
          isSimulationActive ||
          viewportAnimationActiveRef.current ||
          isDimmingActive ||
          isLensAnimationActive ||
          isLabelAnimationActive;
        const labelRenderBudget = resolveLabelRenderBudget(
          preset.labelRenderBudget,
          isInteractionFrame
        );

        const rendererBackend = rendererBackendRef.current;
        if (rendererBackend) {
          const renderStartedAt = performance.now();
          const rendered = rendererBackend.render({
            width: dw,
            height: dh,
            dpr,
            nodes: renderNodes,
            links: renderLinks,
            viewport: viewportRef.current,
            theme,
            preset,
            selectedNodeId: renderSelectedId,
            hoveredNodeId: renderHoveredId,
            rootNodeId,
            neighbors: activeNeighbors,
            dimProgress: dimProgressRef.current,
            labelVisibilityByNodeId: visibleLabelIds,
            lensVisibilityByNodeId,
            spatialIndex: spatialIndexRef.current,
            labelRenderBudget
          });

          if (__OGRAPH_DEBUG_RUNTIME__ && rendered && runtimeTelemetryRef) {
            const telemetry = runtimeTelemetryRef.current;
            const renderedAt = performance.now();
            telemetry.renderer = rendererBackend.kind;
            telemetry.renderCount += 1;
            telemetry.lastRenderDurationMs = renderedAt - renderStartedAt;
            telemetry.lastRenderAt = renderedAt;
            telemetry.materializedNodes = renderNodes.length;
            telemetry.materializedLinks = renderLinks.length;
            telemetry.materializedLabels = visibleLabelIds.size;
            const rendererStats = rendererBackend.getStats?.();
            if (rendererStats) {
              telemetry.materializedNodes = rendererStats.materializedNodes;
              telemetry.materializedLinks = rendererStats.materializedLinks;
              telemetry.materializedLabels = rendererStats.materializedLabels;
              telemetry.visibleNodes = rendererStats.visibleNodes;
              telemetry.visibleLinks = rendererStats.visibleLinks;
              telemetry.visibleLabels = rendererStats.visibleLabels;
            }
            if (
              telemetry.firstVisibleFrameLatencyMs === 0 &&
              telemetry.runtimeStartedAt > 0 &&
              renderNodes.length > 0
            ) {
              telemetry.firstVisibleFrameLatencyMs = renderedAt - telemetry.runtimeStartedAt;
            }
          }
        }
      }

      const rendererWorkPending =
        __OGRAPH_DEBUG_RUNTIME__ && !!rendererBackendRef.current?.hasPendingWork?.();
      const shouldContinue =
        isSimulationActive ||
        isDimmingActive ||
        isLensAnimationActive ||
        isLabelAnimationActive ||
        viewportAnimationActiveRef.current ||
        rendererWorkPending;

      if (__OGRAPH_DEBUG_RUNTIME__ && runtimeTelemetryRef) {
        const reasons = [
          isSimulationActive ? 'simulation' : '',
          isDimmingActive ? 'dimming' : '',
          isLensAnimationActive ? 'lens' : '',
          isLabelAnimationActive ? 'labels' : '',
          viewportAnimationActiveRef.current ? 'viewport' : '',
          rendererWorkPending ? 'materialization' : ''
        ].filter(Boolean);
        runtimeTelemetryRef.current.activeFrameReasons = reasons.join(',') || 'idle';
      }

      if (shouldContinue) {
        scheduleFrame();
      } else {
        lastFrameTimeRef.current = null;
      }
      } catch (caught) {
        lastFrameTimeRef.current = null;
        renderRequestedRef.current = false;
        viewportAnimationActiveRef.current = false;
        simulationActivityRef.current?.stop();

        if (onErrorRef.current) {
          onErrorRef.current(toGraphError(caught));
          return;
        }

        throw caught;
      }
    };

    requestRender();
  }, [
    canvasRef,
    canvasSizeRef,
    renderRequestedRef,
    drawFrameRef,
    scheduleFrame,
    requestRender,
    simulationActivityRef,
    rendererBackendRef,
    runtimeTelemetryRef,
    renderNodesRef,
    renderLinksRef,
    neighborsMapRef,
    spatialIndexRef,
    viewportRef,
    targetViewportRef,
    viewportAnimationActiveRef,
    hoveredNodeIdRef,
    interactionActiveRef,
    selectedNodeId,
    rootNodeId,
    lensVisibleNodeIds,
    sourceNodeIds,
    simulationPaused,
    reduceMotion,
    preset,
    theme
  ]);
}
