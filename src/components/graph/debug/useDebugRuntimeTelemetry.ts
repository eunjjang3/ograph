import { useEffect, useState } from 'react';
import type { GraphRuntimeTelemetry, GraphRuntimeTelemetryRef } from '../graphRuntime';

export function useDebugRuntimeTelemetry(telemetryRef: GraphRuntimeTelemetryRef) {
  const [telemetry, setTelemetry] = useState<GraphRuntimeTelemetry>(() => ({
    ...telemetryRef.current
  }));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTelemetry({ ...telemetryRef.current });
    }, 500);

    return () => window.clearInterval(timer);
  }, [telemetryRef]);

  return telemetry;
}
