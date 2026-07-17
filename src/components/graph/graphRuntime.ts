export type GraphRendererMode = 'canvas2d' | 'pixi';
export type GraphSimulationMode = 'main' | 'worker';

export interface GraphRendererFrameProfile {
  topologyMs: number;
  cullingMs: number;
  materializationMs: number;
  linksMs: number;
  nodesMs: number;
  labelsMs: number;
  submitMs: number;
  totalMs: number;
}

export interface GraphRuntimeTelemetry {
  renderer: GraphRendererMode;
  simulation: GraphSimulationMode;
  renderCount: number;
  lastRenderDurationMs: number;
  lastRenderAt: number;
  lastFrameCpuDurationMs: number;
  lastPreRendererDurationMs: number;
  lastSpatialIndexDurationMs: number;
  lastLabelVisibilityDurationMs: number;
  activeRenderFps: number;
  activeRenderIntervalP95Ms: number;
  activeRenderDurationP50Ms: number;
  activeRenderDurationP95Ms: number;
  activeRenderDurationMaxMs: number;
  activeRenderSampleSize: number;
  activeRenderWindowMs: number;
  activeRenderSequence: number;
  lastRendererProfile: GraphRendererFrameProfile | null;
  simulationUpdateCount: number;
  lastSimulationUpdateAt: number;
  materializedNodes: number;
  materializedLinks: number;
  materializedLabels: number;
  topologySyncDurationMs: number;
  firstVisibleFrameLatencyMs: number;
  runtimeStartedAt: number;
  workerResultAgeMs: number;
  visibleNodes: number;
  visibleLinks: number;
  visibleLabels: number;
  simulationActive: boolean;
  activeFrameReasons: string;
}

export interface GraphRuntimeTelemetryRef {
  current: GraphRuntimeTelemetry;
}

export interface GraphRuntimeOptions {
  renderer: GraphRendererMode;
  simulation: GraphSimulationMode;
  telemetryRef?: GraphRuntimeTelemetryRef;
  createSimulationWorker?: () => Worker;
}

export interface ActiveGraphRenderWindow {
  lastTimestampMs: number | null;
  intervalsMs: number[];
  durationsMs: number[];
}

function resolvePercentile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;

  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.ceil(percentile * sortedValues.length) - 1)
  );
  return sortedValues[index] ?? 0;
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

export function createActiveGraphRenderWindow(): ActiveGraphRenderWindow {
  return {
    lastTimestampMs: null,
    intervalsMs: [],
    durationsMs: []
  };
}

export function resetActiveGraphRenderWindow(window: ActiveGraphRenderWindow) {
  window.lastTimestampMs = null;
  window.intervalsMs = [];
  window.durationsMs = [];
}

export function recordActiveGraphRenderSample(
  window: ActiveGraphRenderWindow,
  telemetry: GraphRuntimeTelemetry,
  timestampMs: number,
  durationMs: number,
  active: boolean
): boolean {
  if (!active || !Number.isFinite(timestampMs) || !Number.isFinite(durationMs) || durationMs < 0) {
    resetActiveGraphRenderWindow(window);
    return false;
  }

  const previousTimestampMs = window.lastTimestampMs;
  window.lastTimestampMs = timestampMs;
  if (previousTimestampMs === null) return false;

  const intervalMs = timestampMs - previousTimestampMs;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    window.intervalsMs = [];
    window.durationsMs = [];
    return false;
  }

  window.intervalsMs.push(intervalMs);
  window.durationsMs.push(durationMs);
  const elapsedMs = window.intervalsMs.reduce((total, interval) => total + interval, 0);
  if (elapsedMs < 1000) return false;

  const sortedIntervals = [...window.intervalsMs].sort((left, right) => left - right);
  const sortedDurations = [...window.durationsMs].sort((left, right) => left - right);
  telemetry.activeRenderFps = roundMetric((window.intervalsMs.length * 1000) / elapsedMs);
  telemetry.activeRenderIntervalP95Ms = roundMetric(resolvePercentile(sortedIntervals, 0.95));
  telemetry.activeRenderDurationP50Ms = roundMetric(resolvePercentile(sortedDurations, 0.5));
  telemetry.activeRenderDurationP95Ms = roundMetric(resolvePercentile(sortedDurations, 0.95));
  telemetry.activeRenderDurationMaxMs = roundMetric(sortedDurations.at(-1) ?? 0);
  telemetry.activeRenderSampleSize = window.intervalsMs.length;
  telemetry.activeRenderWindowMs = roundMetric(elapsedMs);
  telemetry.activeRenderSequence += 1;

  window.intervalsMs = [];
  window.durationsMs = [];
  return true;
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
    lastFrameCpuDurationMs: 0,
    lastPreRendererDurationMs: 0,
    lastSpatialIndexDurationMs: 0,
    lastLabelVisibilityDurationMs: 0,
    activeRenderFps: 0,
    activeRenderIntervalP95Ms: 0,
    activeRenderDurationP50Ms: 0,
    activeRenderDurationP95Ms: 0,
    activeRenderDurationMaxMs: 0,
    activeRenderSampleSize: 0,
    activeRenderWindowMs: 0,
    activeRenderSequence: 0,
    lastRendererProfile: null,
    simulationUpdateCount: 0,
    lastSimulationUpdateAt: 0,
    materializedNodes: 0,
    materializedLinks: 0,
    materializedLabels: 0,
    topologySyncDurationMs: 0,
    firstVisibleFrameLatencyMs: 0,
    runtimeStartedAt: typeof performance === 'undefined' ? 0 : performance.now(),
    workerResultAgeMs: 0,
    visibleNodes: 0,
    visibleLinks: 0,
    visibleLabels: 0,
    simulationActive: false,
    activeFrameReasons: 'initializing'
  };
}
