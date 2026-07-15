export type GraphRendererMode = 'canvas2d' | 'pixi';
export type GraphSimulationMode = 'main' | 'worker';

export interface GraphRuntimeTelemetry {
  renderer: GraphRendererMode;
  simulation: GraphSimulationMode;
  renderCount: number;
  lastRenderDurationMs: number;
  lastRenderAt: number;
  simulationUpdateCount: number;
  lastSimulationUpdateAt: number;
  materializedNodes: number;
  materializedLinks: number;
  materializedLabels: number;
}

export interface GraphRuntimeTelemetryRef {
  current: GraphRuntimeTelemetry;
}

export interface GraphRuntimeOptions {
  renderer: GraphRendererMode;
  simulation: GraphSimulationMode;
  telemetryRef?: GraphRuntimeTelemetryRef;
}

export const DEFAULT_GRAPH_RUNTIME_OPTIONS: Readonly<GraphRuntimeOptions> = {
  renderer: 'canvas2d',
  simulation: 'main'
};

export function createGraphRuntimeTelemetry(
  renderer: GraphRendererMode = 'canvas2d',
  simulation: GraphSimulationMode = 'main'
): GraphRuntimeTelemetry {
  return {
    renderer,
    simulation,
    renderCount: 0,
    lastRenderDurationMs: 0,
    lastRenderAt: 0,
    simulationUpdateCount: 0,
    lastSimulationUpdateAt: 0,
    materializedNodes: 0,
    materializedLinks: 0,
    materializedLabels: 0
  };
}
