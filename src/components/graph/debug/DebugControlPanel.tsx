import type { Dispatch, SetStateAction } from 'react';
import type { GraphNode } from '../types';
import type { GraphDragPhysicsOptions } from '../useGraphSimulation';
import type { DebugGraphMode } from './useDebugGraphState';
import type { DebugPresetConfig } from './mockGraphPresets';
import type { FrameTelemetry } from './useFpsCounter';
import type {
  GraphRendererMode,
  GraphRuntimeTelemetry,
  GraphSimulationMode
} from '../graphRuntime';
import { RotateCcw, Maximize2, Sliders, Info } from 'lucide-react';

const debugSuiteVersion = import.meta.env.VITE_OGRAPH_VERSION ?? '0.1.0';
const NODE_COUNT_OPTIONS = [100, 500, 1000, 2500, 5000, 10000];
const GRAPH_COLOR_NOTE = 'Each node type corresponds to the actual **Ograph Colors**. Large nodes represent hubs or index notes. Small green nodes represent local attachments.';

interface DebugDragTelemetry {
  phase: 'idle' | 'dragging' | 'released';
  nodeId: string | null;
  eventCount: number;
}

interface DebugControlPanelProps {
  rendererMode: GraphRendererMode;
  setRendererMode: (mode: GraphRendererMode) => void;
  simulationMode: GraphSimulationMode;
  setSimulationMode: (mode: GraphSimulationMode) => void;
  nodeCount: number;
  setNodeCount: Dispatch<SetStateAction<number>>;
  avgLinks: number;
  setAvgLinks: Dispatch<SetStateAction<number>>;
  seed: number;
  mode: DebugGraphMode;
  setMode: (mode: DebugGraphMode) => void;
  localDepth: number;
  setLocalDepth: Dispatch<SetStateAction<number>>;
  rootNodeId: string | null;
  setRootNodeId: (rootNodeId: string | null) => void;
  rootSelectorOptions: GraphNode[];
  debugPresets: DebugPresetConfig[];
  selectedDebugBgId: string;
  setSelectedDebugBgId: Dispatch<SetStateAction<string>>;
  activeDebugPreset: DebugPresetConfig;
  labelDensity: number;
  setLabelDensity: Dispatch<SetStateAction<number>>;
  nodeSizeScale: number;
  setNodeSizeScale: Dispatch<SetStateAction<number>>;
  linkDistance: number;
  setLinkDistance: Dispatch<SetStateAction<number>>;
  chargeStrength: number;
  setChargeStrength: Dispatch<SetStateAction<number>>;
  collisionRadius: number;
  setCollisionRadius: Dispatch<SetStateAction<number>>;
  velocityDecay: number;
  setVelocityDecay: Dispatch<SetStateAction<number>>;
  dimmingStrength: number;
  setDimmingStrength: Dispatch<SetStateAction<number>>;
  filteredElements: {
    visibleNodes: number;
    visibleLinks: number;
    simulatedNodes: number;
    simulatedLinks: number;
  };
  zoomScale: number;
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  reactRenderCount: number;
  frameTelemetry: FrameTelemetry;
  runtimeTelemetry: GraphRuntimeTelemetry;
  dragTelemetry: DebugDragTelemetry;
  dragPhysics: GraphDragPhysicsOptions;
  onRandomizeSeed: () => void;
  onRandomHub: () => void;
  onRestart: () => void;
  onFit: () => void;
}

export function DebugControlPanel({
  rendererMode,
  setRendererMode,
  simulationMode,
  setSimulationMode,
  nodeCount,
  setNodeCount,
  avgLinks,
  setAvgLinks,
  seed,
  mode,
  setMode,
  localDepth,
  setLocalDepth,
  rootNodeId,
  setRootNodeId,
  rootSelectorOptions,
  debugPresets,
  selectedDebugBgId,
  setSelectedDebugBgId,
  activeDebugPreset,
  labelDensity,
  setLabelDensity,
  nodeSizeScale,
  setNodeSizeScale,
  linkDistance,
  setLinkDistance,
  chargeStrength,
  setChargeStrength,
  collisionRadius,
  setCollisionRadius,
  velocityDecay,
  setVelocityDecay,
  dimmingStrength,
  setDimmingStrength,
  filteredElements,
  zoomScale,
  hoveredNodeId,
  selectedNodeId,
  reactRenderCount,
  frameTelemetry,
  runtimeTelemetry,
  dragTelemetry,
  dragPhysics,
  onRandomizeSeed,
  onRandomHub,
  onRestart,
  onFit
}: DebugControlPanelProps) {
  return (
    <div className="w-full lg:w-[410px] bg-[#121217] border-l border-gray-850 flex flex-col order-1 lg:order-2 h-[40vh] lg:h-full select-text max-h-[500px] lg:max-h-none overflow-y-auto">
      <div className="p-5 border-b border-gray-850 flex items-center justify-between gap-3 bg-[#181820]">
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-white uppercase flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded bg-sky-500 animate-pulse" />
            Ograph Debug Suite
          </h1>
          <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-mono">Stress Tester & Debug Panel</p>
        </div>
        <div className="text-[10px] bg-[#22222d] border border-gray-700/80 rounded px-2 py-0.5 font-mono text-gray-300">
          v{debugSuiteVersion}
        </div>
      </div>

      <div className="p-5 flex-1 space-y-6">
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-violet-400" />
            0. Runtime Experiment Lane
          </h2>
          <div className="p-4 bg-[#181820] border border-gray-800 rounded-xl space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-2 uppercase">
                Renderer
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['canvas2d', 'pixi'] as const).map(renderer => (
                  <button
                    key={renderer}
                    onClick={() => setRendererMode(renderer)}
                    className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all border ${
                      rendererMode === renderer
                        ? 'bg-violet-600/20 text-violet-300 border-violet-500/80 shadow'
                        : 'bg-gray-900/40 text-gray-400 border-transparent hover:bg-gray-800/40 hover:text-gray-200'
                    }`}
                  >
                    {renderer === 'canvas2d' ? 'Canvas 2D' : 'Pixi WebGL'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-2 uppercase">
                Simulation
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['main', 'worker'] as const).map(simulation => (
                  <button
                    key={simulation}
                    onClick={() => setSimulationMode(simulation)}
                    className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all border ${
                      simulationMode === simulation
                        ? 'bg-violet-600/20 text-violet-300 border-violet-500/80 shadow'
                        : 'bg-gray-900/40 text-gray-400 border-transparent hover:bg-gray-800/40 hover:text-gray-200'
                    }`}
                  >
                    {simulation === 'main' ? 'Main Thread' : 'Worker'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            1. Mock Generator Setup
          </h2>
          <div className="p-4 bg-[#181820] border border-gray-800 rounded-xl space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-2 uppercase">
                Seed Node Capacity
              </label>
              <div className="grid grid-cols-3 gap-1">
                {NODE_COUNT_OPTIONS.map((size) => (
                  <button
                    key={size}
                    onClick={() => setNodeCount(size)}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                      nodeCount === size
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/80 shadow'
                        : 'bg-gray-900/40 text-gray-400 border-transparent hover:bg-gray-800/40 hover:text-gray-200'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono mb-1.5">
                <span className="font-semibold text-gray-300 uppercase">Avg Links / Node</span>
                <span className="text-indigo-400 font-bold">{avgLinks.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="6.5"
                step="0.5"
                value={avgLinks}
                onChange={(e) => setAvgLinks(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-800/60">
              <div className="text-[11px] text-gray-400 font-mono">
                Random Seed: <span className="text-sky-300 font-bold">{seed}</span>
              </div>
              <button
                onClick={onRandomizeSeed}
                className="px-3 py-1 rounded bg-gray-900 hover:bg-gray-850 border border-gray-800 text-[11px] font-medium text-gray-300 hover:text-white transition"
              >
                Regenerate Seed
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            2. Interactive Scopes
          </h2>
          <div className="p-4 bg-[#181820] border border-gray-800 rounded-xl space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-2 uppercase">
                Render Constraint Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['global', 'local'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all border ${
                      mode === m
                        ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/80 shadow'
                        : 'bg-gray-900/40 text-gray-400 border-transparent hover:bg-gray-800/40 hover:text-gray-200'
                    }`}
                  >
                    {m} Mode
                  </button>
                ))}
              </div>
            </div>

            {mode === 'local' && (
              <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-800 space-y-4 animate-fadeIn">
                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1.5">
                    <span className="font-semibold text-gray-300 uppercase">Local Depth BFS Level</span>
                    <span className="text-cyan-400 font-bold">d = {localDepth}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="1"
                    value={localDepth}
                    onChange={(e) => setLocalDepth(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center text-[11px] font-mono mb-1">
                    <span className="font-semibold text-gray-300 uppercase">Focus Anchor Core</span>
                    <button
                      onClick={onRandomHub}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Random Hub
                    </button>
                  </div>
                  <select
                    value={rootNodeId || ''}
                    onChange={(e) => setRootNodeId(e.target.value || null)}
                    className="w-full bg-gray-950 border border-gray-850 rounded px-2 py-1 text-xs text-white/90 outline-none"
                  >
                    <option value="">-- No Root anchor --</option>
                    {rootSelectorOptions.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.label} ({n.type}, deg: {n.degree})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    BFS traverses outward from this node. Double click any node directly on the canvas to set it.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-pink-400" />
            3. Preset Styles & Overrides
          </h2>
          <div className="p-4 bg-[#181820] border border-gray-800 rounded-xl space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-2 uppercase">
                Skin Theme Preset
              </label>
              <select
                value={selectedDebugBgId}
                onChange={(e) => setSelectedDebugBgId(e.target.value)}
                className="w-full bg-gray-950 border border-gray-850 rounded px-2.5 py-1.5 text-xs text-white/95 outline-none font-medium text-gray-100"
              >
                {debugPresets.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1.5 italic font-sans leading-relaxed">
                {activeDebugPreset.description}
              </p>
            </div>

            <div className="space-y-3.5 pt-2.5 border-t border-gray-800/60">
              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-gray-400 uppercase">Label Culling Limit</span>
                  <span className="text-pink-400 font-bold">{labelDensity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={labelDensity}
                  onChange={(e) => setLabelDensity(parseFloat(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-gray-400 uppercase">Node Size Weight</span>
                  <span className="text-pink-400 font-bold">{nodeSizeScale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={nodeSizeScale}
                  onChange={(e) => setNodeSizeScale(parseFloat(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-gray-400 uppercase">Force Link Distance</span>
                  <span className="text-pink-400 font-bold">{linkDistance}px</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="300"
                  step="5"
                  value={linkDistance}
                  onChange={(e) => setLinkDistance(parseInt(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-gray-400 uppercase">Node Charge (Repulsion)</span>
                  <span className="text-pink-400 font-bold">{chargeStrength}</span>
                </div>
                <input
                  type="range"
                  min="-600"
                  max="0"
                  step="5"
                  value={chargeStrength}
                  onChange={(e) => setChargeStrength(parseInt(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-gray-400 uppercase">Collision Boundary Buffer</span>
                  <span className="text-pink-400 font-bold">{collisionRadius}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="80"
                  step="1"
                  value={collisionRadius}
                  onChange={(e) => setCollisionRadius(parseInt(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-gray-400 uppercase">Simulation Viscosity</span>
                  <span className="text-pink-400 font-bold">{velocityDecay.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.02"
                  value={velocityDecay}
                  onChange={(e) => setVelocityDecay(parseFloat(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-gray-400 uppercase">Neighborhood Contrast (Dim)</span>
                  <span className="text-pink-400 font-bold">{(1 - dimmingStrength).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.02"
                  value={dimmingStrength}
                  onChange={(e) => setDimmingStrength(parseFloat(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-gray-900 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            4. Control Diagnostics
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onRestart}
              className="py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/20"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Re-heat Forces
            </button>
            <button
              onClick={onFit}
              className="py-2.5 rounded-xl text-xs font-bold bg-[#1d1d26] hover:bg-[#252531] text-gray-100 border border-gray-750 transition-all flex items-center justify-center gap-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Reset Zoom Scale
            </button>
          </div>
        </div>

        <div
          className="p-4 bg-gray-950 border border-gray-850 rounded-xl space-y-3 font-mono text-[11px]"
          data-testid="runtime-performance-telemetry"
          data-active-render-fps={runtimeTelemetry.activeRenderFps}
          data-active-render-interval-p95-ms={runtimeTelemetry.activeRenderIntervalP95Ms}
          data-active-render-duration-p50-ms={runtimeTelemetry.activeRenderDurationP50Ms}
          data-active-render-duration-p95-ms={runtimeTelemetry.activeRenderDurationP95Ms}
          data-active-render-duration-max-ms={runtimeTelemetry.activeRenderDurationMaxMs}
          data-active-render-sample-size={runtimeTelemetry.activeRenderSampleSize}
          data-active-render-window-ms={runtimeTelemetry.activeRenderWindowMs}
          data-active-render-sequence={runtimeTelemetry.activeRenderSequence}
          data-last-frame-cpu-ms={runtimeTelemetry.lastFrameCpuDurationMs}
          data-last-pre-renderer-ms={runtimeTelemetry.lastPreRendererDurationMs}
          data-last-spatial-index-ms={runtimeTelemetry.lastSpatialIndexDurationMs}
          data-last-label-visibility-ms={runtimeTelemetry.lastLabelVisibilityDurationMs}
          data-profile-topology-ms={runtimeTelemetry.lastRendererProfile?.topologyMs ?? 0}
          data-profile-culling-ms={runtimeTelemetry.lastRendererProfile?.cullingMs ?? 0}
          data-profile-materialization-ms={runtimeTelemetry.lastRendererProfile?.materializationMs ?? 0}
          data-profile-links-ms={runtimeTelemetry.lastRendererProfile?.linksMs ?? 0}
          data-profile-nodes-ms={runtimeTelemetry.lastRendererProfile?.nodesMs ?? 0}
          data-profile-labels-ms={runtimeTelemetry.lastRendererProfile?.labelsMs ?? 0}
          data-profile-submit-ms={runtimeTelemetry.lastRendererProfile?.submitMs ?? 0}
          data-profile-total-ms={runtimeTelemetry.lastRendererProfile?.totalMs ?? 0}
        >
          <h3 className="text-[10px] font-bold text-gray-500 tracking-wider uppercase border-b border-gray-850 pb-1.5">
            Network Telemetry Logs
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-gray-400">
            <div>Nodes (Visible): <span className="text-white font-bold">{filteredElements.visibleNodes}</span></div>
            <div>Links (Visible): <span className="text-white font-bold">{filteredElements.visibleLinks}</span></div>
            <div>Nodes (Simulated): <span className="text-white font-bold">{filteredElements.simulatedNodes}</span></div>
            <div>Links (Simulated): <span className="text-white font-bold">{filteredElements.simulatedLinks}</span></div>
            <div>Zoom Multiplier: <span className="text-cyan-400 font-bold">{zoomScale.toFixed(2)}x</span></div>
            <div>Render Count: <span className="text-emerald-400">{reactRenderCount}</span></div>
            <div>Frame FPS: <span className="text-emerald-300 font-bold">{frameTelemetry.fps}</span></div>
            <div>Frame Samples: <span className="text-gray-200 font-bold">{frameTelemetry.sampleSize}</span></div>
            <div>Frame p50: <span className="text-amber-200 font-bold">{frameTelemetry.frameIntervalP50Ms.toFixed(1)}ms</span></div>
            <div>Frame p95: <span className="text-amber-300 font-bold">{frameTelemetry.frameIntervalP95Ms.toFixed(1)}ms</span></div>
            <div>&gt;16.7ms: <span className="text-orange-300 font-bold">{frameTelemetry.longFramesOver16Ms}</span></div>
            <div>&gt;33.3ms: <span className="text-rose-300 font-bold">{frameTelemetry.longFramesOver33Ms}</span></div>
            <div>Renderer: <span className="text-violet-300 font-bold">{runtimeTelemetry.renderer}</span></div>
            <div>Simulation: <span className="text-violet-300 font-bold">{runtimeTelemetry.simulation}</span></div>
            <div>Graph Draws: <span data-testid="runtime-render-count" className="text-emerald-300 font-bold">{runtimeTelemetry.renderCount}</span></div>
            <div>Last Draw CPU: <span className="text-emerald-300 font-bold">{runtimeTelemetry.lastRenderDurationMs.toFixed(2)}ms</span></div>
            <div>Simulation Updates: <span data-testid="runtime-simulation-updates" className="text-cyan-300 font-bold">{runtimeTelemetry.simulationUpdateCount}</span></div>
            <div>Simulation State: <span data-testid="runtime-simulation-state" className="text-cyan-300 font-bold">{runtimeTelemetry.simulationActive ? 'active' : 'idle'}</span></div>
            <div className="col-span-2">Frame Reasons: <span data-testid="runtime-frame-reasons" className="text-cyan-300 font-bold">{runtimeTelemetry.activeFrameReasons}</span></div>
            <div>Materialized Nodes: <span className="text-cyan-300 font-bold">{runtimeTelemetry.materializedNodes}</span></div>
            <div>Materialized Links: <span className="text-cyan-300 font-bold">{runtimeTelemetry.materializedLinks}</span></div>
            <div>Materialized Labels: <span className="text-cyan-300 font-bold">{runtimeTelemetry.materializedLabels}</span></div>
            <div>Viewport Nodes: <span className="text-cyan-300 font-bold">{runtimeTelemetry.visibleNodes}</span></div>
            <div>Viewport Links: <span className="text-cyan-300 font-bold">{runtimeTelemetry.visibleLinks}</span></div>
            <div>Viewport Labels: <span className="text-cyan-300 font-bold">{runtimeTelemetry.visibleLabels}</span></div>
            <div>Topology Sync: <span className="text-cyan-300 font-bold">{runtimeTelemetry.topologySyncDurationMs.toFixed(2)}ms</span></div>
            <div>First Visible: <span className="text-cyan-300 font-bold">{runtimeTelemetry.firstVisibleFrameLatencyMs.toFixed(1)}ms</span></div>
            <div>Worker Result Age: <span className="text-cyan-300 font-bold">{runtimeTelemetry.workerResultAgeMs.toFixed(1)}ms</span></div>
            <div>Drag Phase: <span className="text-amber-300 font-bold">{dragTelemetry.phase}</span></div>
            <div>Drag Events: <span className="text-amber-300 font-bold">{dragTelemetry.eventCount}</span></div>
            <div>Drag Alpha Start: <span className="text-cyan-300 font-bold">{dragPhysics.startAlphaTarget.toFixed(2)}</span></div>
            <div>Drag Alpha Move: <span className="text-cyan-300 font-bold">{dragPhysics.moveAlphaTarget.toFixed(2)}</span></div>
            <div className="col-span-2">
              Connected Wake:{' '}
              <span className={dragPhysics.wakeConnectedNodes ? 'text-emerald-300 font-bold' : 'text-gray-300 font-bold'}>
                {dragPhysics.wakeConnectedNodes ? 'enabled' : 'disabled'}
              </span>
            </div>
            <div className="col-span-2 truncate">
              Dragged Node ID:{' '}
              <span className="text-amber-300 font-bold">{dragTelemetry.nodeId ? dragTelemetry.nodeId : 'none'}</span>
            </div>
            <div className="col-span-2 truncate">
              Mouse Hover ID:{' '}
              <span className="text-pink-300 font-bold">{hoveredNodeId ? hoveredNodeId : 'none'}</span>
            </div>
            <div className="col-span-2 truncate">
              Selected Node ID:{' '}
              <span className="text-sky-300 font-bold">{selectedNodeId ? selectedNodeId : 'none'}</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-indigo-950/20 border border-indigo-900/30 rounded-xl flex gap-3 text-indigo-300/80 leading-relaxed text-[11px]">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            {GRAPH_COLOR_NOTE}
          </div>
        </div>
      </div>
    </div>
  );
}
