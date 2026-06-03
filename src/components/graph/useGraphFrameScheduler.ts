import { useCallback, useEffect, useRef } from 'react';

export function useGraphFrameScheduler() {
  const renderRequestedRef = useRef<boolean>(true);
  const frameIdRef = useRef<number | null>(null);
  const drawFrameRef = useRef<(timestamp: number) => void>(() => {});
  const disposedRef = useRef<boolean>(false);

  const scheduleFrame = useCallback(() => {
    if (disposedRef.current || frameIdRef.current !== null) return;

    frameIdRef.current = requestAnimationFrame(timestamp => {
      frameIdRef.current = null;
      if (disposedRef.current) return;

      drawFrameRef.current(timestamp);
    });
  }, []);

  const requestRender = useCallback(() => {
    renderRequestedRef.current = true;
    scheduleFrame();
  }, [scheduleFrame]);

  useEffect(() => {
    disposedRef.current = false;

    return () => {
      disposedRef.current = true;
      renderRequestedRef.current = false;
      drawFrameRef.current = () => {};

      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, []);

  return {
    renderRequestedRef,
    frameIdRef,
    drawFrameRef,
    scheduleFrame,
    requestRender
  };
}
