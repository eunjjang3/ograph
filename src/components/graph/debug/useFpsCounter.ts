import { useEffect, useState } from 'react';

const SIXTY_HZ_FRAME_BUDGET_MS = 1000 / 60;
const THIRTY_HZ_FRAME_BUDGET_MS = 1000 / 30;
const FRAME_TELEMETRY_WINDOW_MS = 1000;

export interface FrameTelemetry {
  fps: number;
  frameIntervalP50Ms: number;
  frameIntervalP95Ms: number;
  longFramesOver16Ms: number;
  longFramesOver33Ms: number;
  sampleSize: number;
}

const EMPTY_FRAME_TELEMETRY: FrameTelemetry = {
  fps: 0,
  frameIntervalP50Ms: 0,
  frameIntervalP95Ms: 0,
  longFramesOver16Ms: 0,
  longFramesOver33Ms: 0,
  sampleSize: 0
};

export interface FrameTelemetryWindow {
  lastFrameTimeMs: number | null;
  elapsedMs: number;
  intervalsMs: number[];
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

export function summarizeFrameIntervals(
  intervals: readonly number[]
): Omit<FrameTelemetry, 'fps'> {
  const finiteIntervals = intervals.filter(interval => Number.isFinite(interval) && interval >= 0);
  const sortedIntervals = [...finiteIntervals].sort((left, right) => left - right);

  return {
    frameIntervalP50Ms: roundMetric(resolvePercentile(sortedIntervals, 0.5)),
    frameIntervalP95Ms: roundMetric(resolvePercentile(sortedIntervals, 0.95)),
    longFramesOver16Ms: finiteIntervals.filter(interval => interval > SIXTY_HZ_FRAME_BUDGET_MS).length,
    longFramesOver33Ms: finiteIntervals.filter(interval => interval > THIRTY_HZ_FRAME_BUDGET_MS).length,
    sampleSize: finiteIntervals.length
  };
}

export function createFrameTelemetryWindow(): FrameTelemetryWindow {
  return {
    lastFrameTimeMs: null,
    elapsedMs: 0,
    intervalsMs: []
  };
}

export function resetFrameTelemetryWindow(window: FrameTelemetryWindow) {
  window.lastFrameTimeMs = null;
  window.elapsedMs = 0;
  window.intervalsMs = [];
}

export function recordFrameTimestamp(
  window: FrameTelemetryWindow,
  now: number
): FrameTelemetry | null {
  if (!Number.isFinite(now)) {
    resetFrameTelemetryWindow(window);
    return null;
  }

  const previousFrameTimeMs = window.lastFrameTimeMs;
  window.lastFrameTimeMs = now;
  if (previousFrameTimeMs === null) return null;

  const intervalMs = now - previousFrameTimeMs;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    window.elapsedMs = 0;
    window.intervalsMs = [];
    return null;
  }

  // Do not combine a suspended/background gap with dozens of earlier 60 Hz
  // intervals. A gap that spans the complete window becomes its own sample so
  // FPS and percentiles describe the same timestamps instead of contradicting
  // one another after tab resume.
  if (intervalMs >= FRAME_TELEMETRY_WINDOW_MS) {
    window.elapsedMs = intervalMs;
    window.intervalsMs = [intervalMs];
  } else {
    window.elapsedMs += intervalMs;
    window.intervalsMs.push(intervalMs);
  }

  if (window.elapsedMs < FRAME_TELEMETRY_WINDOW_MS) return null;

  const intervals = window.intervalsMs;
  const elapsedMs = window.elapsedMs;
  const telemetry = {
    fps: Math.round((intervals.length * 1000) / elapsedMs),
    ...summarizeFrameIntervals(intervals)
  };
  window.elapsedMs = 0;
  window.intervalsMs = [];
  return telemetry;
}

export function useFpsCounter() {
  const [telemetry, setTelemetry] = useState<FrameTelemetry>(EMPTY_FRAME_TELEMETRY);

  useEffect(() => {
    const frameWindow = createFrameTelemetryWindow();
    let animId: number;

    const fpsLoop = (now: number) => {
      const nextTelemetry = recordFrameTimestamp(frameWindow, now);
      if (nextTelemetry) setTelemetry(nextTelemetry);
      animId = requestAnimationFrame(fpsLoop);
    };

    const resetForVisibilityChange = () => resetFrameTelemetryWindow(frameWindow);

    document.addEventListener('visibilitychange', resetForVisibilityChange);
    animId = requestAnimationFrame(fpsLoop);
    return () => {
      document.removeEventListener('visibilitychange', resetForVisibilityChange);
      cancelAnimationFrame(animId);
    };
  }, []);

  return telemetry;
}
