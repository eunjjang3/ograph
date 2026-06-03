import type { Dispatch, SetStateAction } from 'react';
import type { GraphNode } from '../types';
import type { GraphDragPhysicsOptions } from '../useGraphSimulation';
import type { DebugGraphMode } from './useDebugGraphState';
import type { DebugPresetConfig } from './mockGraphPresets';
import { RotateCcw, Maximize2, Sliders, Info } from 'lucide-react';

const NODE_COUNT_OPTIONS = [100, 500, 1000, 2500, 5000, 10000];
const GRAPH_COLOR_NOTE = 'Each node type corresponds to the actual **Ograph Colors**. Large nodes represent hubs or index notes. Small green nodes represent local attachments.';

interface DebugDragTelemetry {
  phase: 'idle' | 'dragging' | 'released';
  nodeId: string | null;
  eventCount: number;
}

interface DebugControlPanelProps {
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
  dragTelemetry: DebugDragTelemetry;
  dragPhysics: GraphDragPhysicsOptions;
  onRandomizeSeed: () => void;
  onRandomHub: () => void;
  onRestart: () => void;
  onFit: () => void;
}

export function DebugControlPanel({
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
          v1.1
        </div>
      </div>

      <div className="p-5 flex-1 space-y-6">
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

        <div className="p-4 bg-gray-950 border border-gray-850 rounded-xl space-y-3 font-mono text-[11px]">
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
