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
  onError
}: UseGraphRendererBackendParams) {
  const rendererBackendRef = useRef<GraphRendererBackend | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let backend: GraphRendererBackend;

    try {
      backend = createGraphRendererBackend(renderer);
    } catch (caught) {
      onErrorRef.current?.(toGraphError(caught));
      return;
    }

    rendererBackendRef.current = backend;
    if (__OGRAPH_DEBUG_RUNTIME__ && telemetryRef) {
      telemetryRef.current.renderer = renderer;
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
          onErrorRef.current?.(toGraphError(caught));
        }
      });

    return () => {
      disposed = true;
      if (rendererBackendRef.current === backend) {
        rendererBackendRef.current = null;
      }
      backend.destroy();
    };
  }, [canvasRef, renderer, requestRender, telemetryRef]);

  return rendererBackendRef;
}
