import { useEffect, useState } from 'react';
import type { GraphRuntimeTelemetry, GraphRuntimeTelemetryRef } from '../graphRuntime';

export function useDebugRuntimeTelemetry(telemetryRef: GraphRuntimeTelemetryRef) {
  const [telemetry, setTelemetry] = useState<GraphRuntimeTelemetry>(() => ({
    ...telemetryRef.current
  }));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = { ...telemetryRef.current };
      next.workerResultAgeMs = next.simulation === 'worker' && next.lastSimulationUpdateAt > 0
        ? Math.max(0, performance.now() - next.lastSimulationUpdateAt)
        : 0;
      setTelemetry(next);
    }, 500);

    return () => window.clearInterval(timer);
  }, [telemetryRef]);

  return telemetry;
}
