import { useEffect, useState } from 'react';

const SIXTY_HZ_FRAME_BUDGET_MS = 1000 / 60;
const THIRTY_HZ_FRAME_BUDGET_MS = 1000 / 30;

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

export function useFpsCounter() {
  const [telemetry, setTelemetry] = useState<FrameTelemetry>(EMPTY_FRAME_TELEMETRY);

  useEffect(() => {
    let frameCount = 0;
    let lastFpsUpdateTime = performance.now();
    let lastFrameTime: number | null = null;
    let frameIntervals: number[] = [];
    let animId: number;

    const fpsLoop = (now: number) => {
      if (lastFrameTime !== null) {
        frameIntervals.push(now - lastFrameTime);
      }
      lastFrameTime = now;
      frameCount++;

      if (now >= lastFpsUpdateTime + 1000) {
        const elapsedMs = now - lastFpsUpdateTime;
        setTelemetry({
          fps: Math.round((frameCount * 1000) / elapsedMs),
          ...summarizeFrameIntervals(frameIntervals)
        });
        frameCount = 0;
        frameIntervals = [];
        lastFpsUpdateTime = now;
      }
      animId = requestAnimationFrame(fpsLoop);
    };

    animId = requestAnimationFrame(fpsLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  return telemetry;
}
