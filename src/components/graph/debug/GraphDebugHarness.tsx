import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GraphView } from '../GraphView';
import type { GraphViewRef } from '../GraphView';
import type { GraphViewProps } from '../types';
import { Activity, ShieldAlert } from 'lucide-react';
import { DebugControlPanel } from './DebugControlPanel';
import { useDebugGraphPreset } from './useDebugGraphPreset';
import { useDebugGraphState } from './useDebugGraphState';
import { useFpsCounter } from './useFpsCounter';
import { getGraphDragPhysicsForMode } from '../useGraphSimulation';
import { createGraphRuntimeTelemetry } from '../graphRuntime';
import type { GraphRuntimeOptions, GraphRuntimeTelemetryRef } from '../graphRuntime';
import type { GraphRendererMode, GraphSimulationMode } from '../graphRuntime';
import { useDebugRuntimeTelemetry } from './useDebugRuntimeTelemetry';

const CONTROL_HINTS = [
  'Drag Node to slide physics anchors',
  'Left-click background + Drag to Pan View',
  'Scroll mouse-wheel over node to zoom',
  'Double-click Node to set Local Zoom Root'
];

type DragTelemetryPhase = 'idle' | 'dragging' | 'released';

interface DragTelemetry {
  phase: DragTelemetryPhase;
  nodeId: string | null;
  eventCount: number;
}

const DebugGraphView = GraphView as unknown as (
  props: GraphViewProps &
    { runtimeOptions: GraphRuntimeOptions } &
    React.RefAttributes<GraphViewRef>
) => React.ReactElement | null;

function createDebugSimulationWorker() {
  return new Worker(new URL('../graphSimulation.worker.ts', import.meta.url), {
    type: 'module',
    name: 'ograph-debug-simulation'
  });
}

export function GraphDebugHarness() {
  const graphViewRef = useRef<GraphViewRef | null>(null);
  const graphState = useDebugGraphState();
  const graphPreset = useDebugGraphPreset(graphState.localDepth);
  const frameTelemetry = useFpsCounter();
  const [rendererMode, setRendererMode] = useState<GraphRendererMode>('canvas2d');
  const [simulationMode, setSimulationMode] = useState<GraphSimulationMode>('main');
  const runtimeTelemetryRef = useMemo<GraphRuntimeTelemetryRef>(() => ({
    current: createGraphRuntimeTelemetry(rendererMode, simulationMode)
  }), [
    graphState.avgLinks,
    graphState.nodeCount,
    graphState.seed,
    rendererMode,
    simulationMode
  ]);
  const runtimeOptions = useMemo<GraphRuntimeOptions>(() => ({
    renderer: rendererMode,
    simulation: simulationMode,
    telemetryRef: runtimeTelemetryRef,
    createSimulationWorker: simulationMode === 'worker'
      ? createDebugSimulationWorker
      : undefined,
    runKey: `${graphState.nodeCount}:${graphState.avgLinks}:${graphState.seed}`
  }), [
    graphState.avgLinks,
    graphState.nodeCount,
    graphState.seed,
    rendererMode,
    runtimeTelemetryRef,
    simulationMode
  ]);
  const runtimeTelemetry = useDebugRuntimeTelemetry(runtimeTelemetryRef);
  const [zoomScale, setZoomScale] = useState<number>(0.8);
  const [dragTelemetry, setDragTelemetry] = useState<DragTelemetry>({
    phase: 'idle',
    nodeId: null,
    eventCount: 0
  });
  const reactRenderCounterRef = useRef<number>(0);
  const dragEventCounterRef = useRef<number>(0);
  const dragFrameRef = useRef<number | null>(null);
  reactRenderCounterRef.current += 1;
  const dragPhysics = getGraphDragPhysicsForMode(graphState.mode);

  const handleRestart = useCallback(() => {
    graphViewRef.current?.restartSimulation();
  }, []);

  const handleFit = useCallback(() => {
    graphViewRef.current?.fitToView();
  }, []);

  const handleViewportChange = useCallback((v: { scale: number }) => {
    setZoomScale(v.scale);
  }, []);

  const scheduleDragTelemetry = useCallback((phase: DragTelemetryPhase, nodeId: string | null) => {
    if (dragFrameRef.current !== null) {
      return;
    }

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDragTelemetry({
        phase,
        nodeId,
        eventCount: dragEventCounterRef.current
      });
    });
  }, []);

  useEffect(() => () => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
    }
  }, []);

  useEffect(() => {
    // Warm the debug-only renderer chunk while the baseline lane is visible so
    // lane switching measures WebGL initialization rather than network/module latency.
    void import('../pixiGraphRenderer');
  }, []);

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen bg-[#0d0d11] text-gray-200 overflow-hidden font-sans">
      <div className="flex-1 relative flex flex-col min-w-0 order-2 lg:order-1 h-[60vh] lg:h-full border-t border-gray-800 lg:border-t-0 p-3 lg:p-5">
        <div className="absolute top-6 left-6 z-10 flex flex-col gap-1 pointer-events-none">
          <div
            data-testid="debug-frame-telemetry"
            className="flex items-center gap-2 bg-[#16161c]/90 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/95 shadow-xl"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-semibold uppercase tracking-wider text-[10px] text-gray-400">FPS:</span>
            <span className="font-mono text-emerald-400 font-bold">{frameTelemetry.fps}</span>
            <span className="text-white/20">|</span>
            <span className="font-semibold uppercase tracking-wider text-[10px] text-gray-400">P95:</span>
            <span className="font-mono text-amber-300 font-bold">{frameTelemetry.frameIntervalP95Ms.toFixed(1)}ms</span>
            <span className="text-white/20">|</span>
            <span className="font-semibold uppercase tracking-wider text-[10px] text-gray-400">Zoom:</span>
            <span className="font-mono text-cyan-400 font-bold">{zoomScale.toFixed(2)}x</span>
          </div>
          {graphState.nodeCount >= 5000 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-md px-2.5 py-1 text-[10px] text-amber-400 backdrop-blur shadow">
              <ShieldAlert className="w-3 h-3" />
              <span>Stress-test mode ({graphState.nodeCount.toLocaleString()} nodes)</span>
            </div>
          )}
        </div>

        <div className="absolute bottom-6 right-6 z-10 hidden md:flex items-center gap-3 bg-[#16161c]/80 backdrop-blur-sm border border-white/5 rounded-lg p-3 text-[11px] text-gray-400 pointer-events-none">
          <div className="flex flex-col gap-1">
            <span className="text-gray-300 font-medium">Controls:</span>
            {CONTROL_HINTS.map(hint => (
              <span key={hint}>• {hint}</span>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-2xl bg-[#121217] border border-gray-850 overflow-hidden relative shadow-2xl shadow-black/80">
          <DebugGraphView
            ref={graphViewRef}
            nodes={graphState.originalNodes}
            links={graphState.originalLinks}
            selectedNodeId={graphState.selectedNodeId}
            rootNodeId={graphState.rootNodeId}
            hoveredNodeId={graphState.hoveredNodeId}
            mode={graphState.mode}
            localDepth={graphState.localDepth}
            preset={graphPreset.finalPreset}
            theme={graphPreset.finalTheme}
            runtimeOptions={runtimeOptions}
            onNodeClick={(n) => {
              graphState.setSelectedNodeId(n.id);
            }}
            onNodeDoubleClick={(n) => {
              graphState.setRootNodeId(n.id);
              graphState.setMode('local');
            }}
            onNodeHover={(n) => {
              graphState.setHoveredNodeId(n ? n.id : null);
            }}
            onNodeDragStart={(n) => {
              dragEventCounterRef.current = 0;
              setDragTelemetry({
                phase: 'dragging',
                nodeId: n.id,
                eventCount: 0
              });
            }}
            onNodeDrag={(n) => {
              dragEventCounterRef.current += 1;
              scheduleDragTelemetry('dragging', n.id);
            }}
            onNodeDragEnd={(n) => {
              setDragTelemetry({
                phase: 'released',
                nodeId: n.id,
                eventCount: dragEventCounterRef.current
              });
            }}
            onViewportChange={handleViewportChange}
          />
        </div>
      </div>

      <DebugControlPanel
        rendererMode={rendererMode}
        setRendererMode={setRendererMode}
        simulationMode={simulationMode}
        setSimulationMode={setSimulationMode}
        nodeCount={graphState.nodeCount}
        setNodeCount={graphState.setNodeCount}
        avgLinks={graphState.avgLinks}
        setAvgLinks={graphState.setAvgLinks}
        seed={graphState.seed}
        mode={graphState.mode}
        setMode={graphState.setMode}
        localDepth={graphState.localDepth}
        setLocalDepth={graphState.setLocalDepth}
        rootNodeId={graphState.rootNodeId}
        setRootNodeId={graphState.setRootNodeId}
        rootSelectorOptions={graphState.rootSelectorOptions}
        debugPresets={graphPreset.debugPresets}
        selectedDebugBgId={graphPreset.selectedDebugBgId}
        setSelectedDebugBgId={graphPreset.setSelectedDebugBgId}
        activeDebugPreset={graphPreset.activeDebugPreset}
        labelDensity={graphPreset.labelDensity}
        setLabelDensity={graphPreset.setLabelDensity}
        nodeSizeScale={graphPreset.nodeSizeScale}
        setNodeSizeScale={graphPreset.setNodeSizeScale}
        linkDistance={graphPreset.linkDistance}
        setLinkDistance={graphPreset.setLinkDistance}
        chargeStrength={graphPreset.chargeStrength}
        setChargeStrength={graphPreset.setChargeStrength}
        collisionRadius={graphPreset.collisionRadius}
        setCollisionRadius={graphPreset.setCollisionRadius}
        velocityDecay={graphPreset.velocityDecay}
        setVelocityDecay={graphPreset.setVelocityDecay}
        dimmingStrength={graphPreset.dimmingStrength}
        setDimmingStrength={graphPreset.setDimmingStrength}
        filteredElements={graphState.filteredElements}
        zoomScale={zoomScale}
        hoveredNodeId={graphState.hoveredNodeId}
        selectedNodeId={graphState.selectedNodeId}
        reactRenderCount={reactRenderCounterRef.current}
        frameTelemetry={frameTelemetry}
        runtimeTelemetry={runtimeTelemetry}
        dragTelemetry={dragTelemetry}
        dragPhysics={dragPhysics}
        onRandomizeSeed={graphState.randomizeSeed}
        onRandomHub={graphState.randomizeHub}
        onRestart={handleRestart}
        onFit={handleFit}
      />
    </div>
  );
}
