import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { createGraphRendererBackend } from './graphRenderer';
import type { GraphRendererBackend } from './graphRenderer';
import type { GraphRendererMode, GraphRuntimeTelemetryRef } from './graphRuntime';

declare const __OGRAPH_DEBUG_RUNTIME__: boolean;

interface UseGraphRendererBackendParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  renderer: GraphRendererMode;
  requestRender: () => void;
  telemetryRef?: GraphRuntimeTelemetryRef;
  onUnavailable?: (renderer: GraphRendererMode, error: Error) => boolean;
  onError?: (error: Error) => void;
}

function toGraphError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}

export function useGraphRendererBackend({
  canvasRef,
  renderer,
  requestRender,
  telemetryRef,
  onUnavailable,
  onError
}: UseGraphRendererBackendParams) {
  const rendererBackendRef = useRef<GraphRendererBackend | null>(null);
  const onErrorRef = useRef(onError);
  const onUnavailableRef = useRef(onUnavailable);
  const telemetryRefRef = useRef(telemetryRef);
  onErrorRef.current = onError;
  onUnavailableRef.current = onUnavailable;
  telemetryRefRef.current = telemetryRef;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let backend: GraphRendererBackend;

    try {
      backend = createGraphRendererBackend(renderer);
    } catch (caught) {
      const error = toGraphError(caught);
      if (!onUnavailableRef.current?.(renderer, error)) {
        onErrorRef.current?.(error);
      }
      return;
    }

    rendererBackendRef.current = backend;
    if (__OGRAPH_DEBUG_RUNTIME__ && telemetryRefRef.current) {
      telemetryRefRef.current.current.renderer = renderer;
    }

    Promise.resolve(backend.initialize(canvas))
      .then(() => {
        if (!disposed) {
          requestRender();
        }
      })
      .catch(caught => {
        if (!disposed) {
          backend.destroy();
          rendererBackendRef.current = null;
          const error = toGraphError(caught);
          if (!onUnavailableRef.current?.(renderer, error)) {
            onErrorRef.current?.(error);
          }
        }
      });

    return () => {
      disposed = true;
      if (rendererBackendRef.current === backend) {
        rendererBackendRef.current = null;
      }
      backend.destroy();
    };
  }, [canvasRef, renderer, requestRender]);

  return rendererBackendRef;
}
