"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import type * as React from 'react';
import type {
  GraphCameraFocusOptions,
  GraphLink,
  GraphNode,
  GraphNodeMetadata,
  GraphPreset,
  GraphTheme,
  GraphViewProps
} from './types';
import { defaultGraphPreset, defaultGraphTheme } from './presets';
import { getGraphDragPhysicsForMode, useGraphSimulation } from './useGraphSimulation';
import { useCanvasSize } from './useCanvasSize';
import { useGraphFrameScheduler } from './useGraphFrameScheduler';
import { useGraphPointerInteractions } from './useGraphPointerInteractions';
import { useGraphRenderLoop } from './useGraphRenderLoop';
import { resolveViewportForGraphNode, useViewportControls } from './useViewportControls';
import { useGraphLensScope } from './useGraphLensScope';
import { useGraphGrowthAnimation } from './useGraphGrowthAnimation';
import { buildSpatialIndex } from './spatialIndex';
import type { Viewport } from './graphMath';
import { GraphErrorBoundary } from './GraphErrorBoundary';
import { normalizeGraphInput } from './inputValidation';
import { useGraphRendererBackend } from './useGraphRendererBackend';
import { DEFAULT_GRAPH_RUNTIME_OPTIONS } from './graphRuntime';
import type { GraphRuntimeOptions } from './graphRuntime';

declare const __OGRAPH_DEBUG_RUNTIME__: boolean;

export interface GraphViewRef {
  /** Fits the current global graph or local lens scope into the container. */
  fitToView: () => void;
  /** Centers the camera on a visible node without changing selection, hover, or local root state. */
  focusCameraOnNode: (nodeId: string, options?: GraphCameraFocusOptions) => boolean;
  /** Resets pan and zoom to the centered default viewport. */
  resetViewport: () => void;
  /** Reheats and restarts the simulation unless the graph is paused. */
  restartSimulation: () => void;
}

const LOCAL_LENS_REFRESH_ALPHA = 0.04;

function getCameraFocusRequestKey(
  nodeId: string,
  options: GraphCameraFocusOptions | undefined
): string {
  return JSON.stringify([
    nodeId,
    options?.animated ?? null,
    options?.minScale ?? null,
    options?.scale ?? null
  ]);
}

const graphContainerStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  height: '100%',
  userSelect: 'none'
};

const graphCanvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  touchAction: 'none',
  cursor: 'grab'
};

const hoverTooltipStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: 280,
  overflow: 'hidden',
  border: '1px solid #2b2b36',
  borderRadius: 4,
  backgroundColor: '#1e1e24',
  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.35), 0 8px 10px -6px rgb(0 0 0 / 0.35)',
  color: 'rgb(255 255 255 / 0.8)',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 12,
  lineHeight: 1.35,
  padding: '6px 12px',
  pointerEvents: 'none',
  whiteSpace: 'nowrap'
};

const hoverTooltipDotStyle: React.CSSProperties = {
  flex: '0 0 auto',
  width: 8,
  height: 8,
  borderRadius: 9999,
  backgroundColor: '#38bdf8'
};

const hoverTooltipLabelStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const hoverTooltipTypeStyle: React.CSSProperties = {
  flex: '0 0 auto',
  color: 'rgb(255 255 255 / 0.4)',
  marginLeft: 4
};

interface GraphViewCanvasProps<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
> extends Omit<
  GraphViewProps<NodeMetadata, LinkMetadata>,
  'nodes' | 'links' | 'localDepth' | 'theme' | 'preset' | 'className' | 'style'
> {
  nodes: GraphNode<NodeMetadata>[];
  links: GraphLink<LinkMetadata, NodeMetadata>[];
  localDepth: number;
  presetConf: GraphPreset;
  themeConf: GraphTheme;
  containerRef: React.RefObject<HTMLDivElement | null>;
  runtimeOptions: GraphRuntimeOptions;
}

type GraphViewCanvasComponent = (<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
>(
  props: GraphViewCanvasProps<NodeMetadata, LinkMetadata> & React.RefAttributes<GraphViewRef>
) => React.ReactElement | null) & {
  displayName?: string;
};

function GraphViewCanvasInner<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
>(
  props: GraphViewCanvasProps<NodeMetadata, LinkMetadata>,
  ref: React.ForwardedRef<GraphViewRef>
) {
  const {
    nodes,
    links,
    selectedNodeId: externalSelectedNodeId,
    hoveredNodeId: externalHoveredNodeId,
    rootNodeId,
    mode = 'global',
    localDepth,
    growthAnimation,
    cameraFocusNodeId,
    cameraFocusOptions,
    paused = false,
    presetConf,
    themeConf,
    containerRef,
    runtimeOptions,
    onNodeClick,
    onNodeDoubleClick,
    onNodeHover,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragEnd,
    onViewportChange,
    onError,
    ariaLabel,
    canvasRole
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeTelemetryRef = __OGRAPH_DEBUG_RUNTIME__
    ? runtimeOptions.telemetryRef
    : undefined;
  const spatialIndexRef = useRef(buildSpatialIndex([]));
  const [reduceMotion, setReduceMotion] = useState(false);
  const growthGraph = useGraphGrowthAnimation({
    nodes,
    links,
    animation: growthAnimation,
    reduceMotion
  });
  const sourceNodeIds = useMemo(() => new Set(growthGraph.nodes.map(node => node.id)), [growthGraph.nodes]);
  const lensScope = useGraphLensScope({
    nodes: growthGraph.nodes,
    links: growthGraph.links,
    mode,
    rootNodeId,
    localDepth,
    reduceMotion
  });
  const {
    renderRequestedRef,
    drawFrameRef,
    scheduleFrame,
    requestRender
  } = useGraphFrameScheduler();
  const { dimensions, canvasSizeRef } = useCanvasSize({
    containerRef,
    canvasRef,
    requestRender
  });
  const rendererBackendRef = useGraphRendererBackend({
    canvasRef,
    renderer: runtimeOptions.renderer,
    requestRender,
    telemetryRef: runtimeTelemetryRef,
    onError
  });

  const onTick = useCallback(() => {
    requestRender();
  }, [requestRender]);
  const dragPhysics = getGraphDragPhysicsForMode(mode);

  const {
    simulationActivityRef,
    activeNodesRef,
    renderNodesRef,
    renderLinksRef,
    neighborsMapRef,
    nodeByIdRef,
    dragStart,
    dragMove,
    dragEnd,
    restartSimulation
  } = useGraphSimulation(
    lensScope.simulationGraph.nodes,
    lensScope.simulationGraph.links,
    lensScope.renderGraph.nodes,
    lensScope.renderGraph.links,
    presetConf,
    onTick,
    {
      graphRefreshAlpha: mode === 'local' ? LOCAL_LENS_REFRESH_ALPHA : undefined,
      coolingMode: mode,
      preserveScopeCentroid: mode === 'local',
      gravityCenterNodeIds: lensScope.visibleNodeIds,
      dragPhysics,
      paused,
      engine: runtimeOptions.simulation,
      runtimeTelemetryRef,
      ...(__OGRAPH_DEBUG_RUNTIME__
        ? { createSimulationWorker: runtimeOptions.createSimulationWorker }
        : {}),
      onError
    }
  );

  const {
    viewportRef,
    targetViewportRef,
    viewportAnimationActiveRef,
    setViewportImmediate,
    animateViewportTo,
    animateFitToView,
    fitToView,
    resetViewport
  } = useViewportControls({
    dimensions,
    activeNodesRef,
    fitNodeIds: lensScope.visibleNodeIds,
    autoFitDependency: growthGraph.nodes,
    autoFitEnabled: mode === 'global',
    requestRender,
    onViewportChange
  });
  const previousModeRef = useRef(mode);
  const globalViewportRef = useRef<Viewport | null>(null);
  const completedCameraFocusRequestRef = useRef<string | null>(null);

  const handleNodeClick = useCallback((node: GraphNode) => {
    onNodeClick?.(node as GraphNode<NodeMetadata>);
  }, [onNodeClick]);

  const handleNodeDoubleClick = useCallback((node: GraphNode) => {
    onNodeDoubleClick?.(node as GraphNode<NodeMetadata>);
  }, [onNodeDoubleClick]);

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    onNodeHover?.(node as GraphNode<NodeMetadata> | null);
  }, [onNodeHover]);

  const handleNodeDragStart = useCallback((node: GraphNode) => {
    onNodeDragStart?.(node as GraphNode<NodeMetadata>);
  }, [onNodeDragStart]);

  const handleNodeDrag = useCallback((node: GraphNode) => {
    onNodeDrag?.(node as GraphNode<NodeMetadata>);
  }, [onNodeDrag]);

  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    onNodeDragEnd?.(node as GraphNode<NodeMetadata>);
  }, [onNodeDragEnd]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setReduceMotion(false);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReduceMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener?.('change', updateMotionPreference);

    return () => {
      mediaQuery.removeEventListener?.('change', updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    const previousMode = previousModeRef.current;

    if (mode === 'local' && previousMode !== 'local') {
      globalViewportRef.current = { ...targetViewportRef.current };
    } else if (mode === 'global' && previousMode === 'local' && globalViewportRef.current) {
      if (reduceMotion) {
        setViewportImmediate(globalViewportRef.current);
      } else {
        animateViewportTo(globalViewportRef.current);
      }
    }

    previousModeRef.current = mode;
  }, [
    animateViewportTo,
    mode,
    reduceMotion,
    setViewportImmediate,
    targetViewportRef
  ]);

  useEffect(() => {
    if (mode !== 'local' || !rootNodeId || lensScope.visibleNodeIds.size === 0) {
      return;
    }

    const minimumLensScale = (globalViewportRef.current?.scale ?? targetViewportRef.current.scale) * 1.18;

    if (reduceMotion) {
      fitToView(minimumLensScale);
    } else {
      animateFitToView(minimumLensScale);
    }
  }, [
    animateFitToView,
    fitToView,
    lensScope.visibleNodeIds,
    mode,
    reduceMotion,
    rootNodeId,
    targetViewportRef
  ]);

  const focusCameraOnNode = useCallback((nodeId: string, options?: GraphCameraFocusOptions) => {
    if (!nodeId || !lensScope.visibleNodeIds.has(nodeId)) {
      return false;
    }

    const node = nodeByIdRef.current.get(nodeId);
    if (!node) {
      return false;
    }

    const viewport = resolveViewportForGraphNode(
      node,
      dimensions,
      targetViewportRef.current,
      options
    );

    if (!viewport) {
      return false;
    }

    if (reduceMotion || options?.animated === false) {
      setViewportImmediate(viewport);
    } else {
      animateViewportTo(viewport);
    }

    return true;
  }, [
    animateViewportTo,
    dimensions,
    lensScope.visibleNodeIds,
    nodeByIdRef,
    reduceMotion,
    setViewportImmediate,
    targetViewportRef
  ]);

  useEffect(() => {
    if (!cameraFocusNodeId) {
      completedCameraFocusRequestRef.current = null;
      return;
    }

    const requestKey = getCameraFocusRequestKey(cameraFocusNodeId, cameraFocusOptions);
    if (completedCameraFocusRequestRef.current === requestKey) {
      return;
    }

    if (focusCameraOnNode(cameraFocusNodeId, cameraFocusOptions)) {
      completedCameraFocusRequestRef.current = requestKey;
    }
  }, [
    cameraFocusNodeId,
    cameraFocusOptions,
    focusCameraOnNode
  ]);

  const {
    hoveredNodeIdRef,
    interactionActiveRef,
    localHoveredNodeId,
    hoveredNode,
    handlers
  } = useGraphPointerInteractions({
    canvasRef,
    activeNodesRef,
    nodeByIdRef,
    spatialIndexRef,
    interactableNodeIds: lensScope.visibleNodeIds,
    viewportRef,
    targetViewportRef,
    viewportAnimationActiveRef,
    preset: presetConf,
    hoveredNodeId: externalHoveredNodeId,
    requestRender,
    animateViewportTo,
    dragStart,
    dragMove,
    dragEnd,
    onNodeClick: handleNodeClick,
    onNodeDoubleClick: handleNodeDoubleClick,
    onNodeHover: handleNodeHover,
    onNodeDragStart: handleNodeDragStart,
    onNodeDrag: handleNodeDrag,
    onNodeDragEnd: handleNodeDragEnd,
    onViewportChange
  });

  useEffect(() => {
    requestRender();
  }, [externalSelectedNodeId, requestRender]);

  useGraphRenderLoop({
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
    selectedNodeId: externalSelectedNodeId,
    rootNodeId,
    lensVisibleNodeIds: lensScope.visibleNodeIds,
    sourceNodeIds,
    simulationPaused: paused,
    reduceMotion,
    preset: presetConf,
    theme: themeConf,
    onError
  });

  useImperativeHandle(ref, () => ({
    fitToView,
    focusCameraOnNode,
    resetViewport,
    restartSimulation
  }), [fitToView, focusCameraOnNode, resetViewport, restartSimulation]);

  return (
    <>
      <canvas
        aria-label={ariaLabel}
        ref={canvasRef}
        role={canvasRole}
        style={graphCanvasStyle}
        {...handlers}
      />

      {localHoveredNodeId && (
        <div
          id="hover-tooltip"
          role="tooltip"
          style={hoverTooltipStyle}
        >
          <span style={hoverTooltipDotStyle} />
          <span style={hoverTooltipLabelStyle}>
            {hoveredNode?.label || localHoveredNodeId}
          </span>
          <span style={hoverTooltipTypeStyle}>
            ({hoveredNode?.type || 'note'})
          </span>
        </div>
      )}
    </>
  );
}

const GraphViewCanvas = forwardRef(GraphViewCanvasInner) as GraphViewCanvasComponent;

GraphViewCanvas.displayName = 'GraphViewCanvas';

type GraphViewComponent = (<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
>(
  props: GraphViewProps<NodeMetadata, LinkMetadata> & React.RefAttributes<GraphViewRef>
) => React.ReactElement | null) & {
  displayName?: string;
};

/** @internal */
type GraphViewRuntimeProps<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
> = GraphViewProps<NodeMetadata, LinkMetadata> & {
  runtimeOptions?: GraphRuntimeOptions;
};

function GraphViewInner<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
>(
  props: GraphViewRuntimeProps<NodeMetadata, LinkMetadata>,
  ref: React.ForwardedRef<GraphViewRef>
) {
  const {
    nodes,
    links,
    localDepth = 2,
    theme: partialTheme,
    preset = 'default',
    className = '',
    style,
    onError,
    runtimeOptions = DEFAULT_GRAPH_RUNTIME_OPTIONS
  } = props;

  const normalizedGraph = useMemo(() => normalizeGraphInput({ nodes, links, localDepth }), [nodes, links, localDepth]);
  const presetConf = useMemo<GraphPreset>(() => {
    if (preset === 'default') {
      return defaultGraphPreset;
    }
    return { ...defaultGraphPreset, ...preset };
  }, [preset]);
  const themeConf = useMemo<GraphTheme>(() => {
    return { ...defaultGraphTheme, ...partialTheme };
  }, [partialTheme]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={containerRef}
      className={className || undefined}
      style={{
        ...graphContainerStyle,
        backgroundColor: themeConf.backgroundColor,
        ...style
      }}
    >
      <GraphErrorBoundary onError={onError}>
        <GraphViewCanvas
          key={runtimeOptions.renderer}
          {...props}
          ref={ref}
          nodes={normalizedGraph.nodes}
          links={normalizedGraph.links}
          localDepth={normalizedGraph.localDepth}
          presetConf={presetConf}
          themeConf={themeConf}
          containerRef={containerRef}
          runtimeOptions={runtimeOptions}
        />
      </GraphErrorBoundary>
    </div>
  );
}

export const GraphView = forwardRef(GraphViewInner) as GraphViewComponent;

GraphView.displayName = 'GraphView';
