import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface UseCanvasSizeParams {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  requestRender: () => void;
}

export interface CanvasBackingSize {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
}

function resolveCssDimension(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function resolveDevicePixelRatio(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function resolveCanvasBackingSize(width: number, height: number, dpr: number): CanvasBackingSize {
  const cssWidth = resolveCssDimension(width);
  const cssHeight = resolveCssDimension(height);
  const safeDpr = resolveDevicePixelRatio(dpr);

  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * safeDpr)),
    pixelHeight: Math.max(1, Math.round(cssHeight * safeDpr)),
    dpr: safeDpr
  };
}

export function useCanvasSize({
  containerRef,
  canvasRef,
  requestRender
}: UseCanvasSizeParams) {
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applyContainerSize = (width: number, height: number) => {
      const nextWidth = width || 600;
      const nextHeight = height || 400;

      setDimensions(prev => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }

        return {
          width: nextWidth,
          height: nextHeight
        };
      });
      requestRender();
    };

    const measureContainer = () => {
      const { width, height } = container.getBoundingClientRect();
      applyContainerSize(width, height);
    };

    if (typeof ResizeObserver === 'undefined') {
      measureContainer();
      if (typeof window === 'undefined') {
        return;
      }

      window.addEventListener('resize', measureContainer);

      return () => {
        window.removeEventListener('resize', measureContainer);
      };
    }

    const handleResize = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      applyContainerSize(width, height);
    };

    const targetObs = new ResizeObserver(handleResize);
    targetObs.observe(container);

    return () => {
      targetObs.disconnect();
    };
  }, [containerRef, requestRender]);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { cssWidth, cssHeight, pixelWidth, pixelHeight, dpr } = resolveCanvasBackingSize(
      dimensions.width,
      dimensions.height,
      typeof window === 'undefined' ? 1 : window.devicePixelRatio
    );
    const lastSize = canvasSizeRef.current;

    if (lastSize.width !== cssWidth || lastSize.height !== cssHeight || lastSize.dpr !== dpr) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvasSizeRef.current = { width: cssWidth, height: cssHeight, dpr };
    }
  }, [canvasRef, dimensions]);

  useEffect(() => {
    let dprMediaQuery: MediaQueryList | null = null;

    const handleSizeChange = () => {
      syncCanvasSize();
      requestRender();
    };

    const handleDprChange = () => {
      handleSizeChange();
      watchDevicePixelRatio();
    };

    const watchDevicePixelRatio = () => {
      if (dprMediaQuery) {
        dprMediaQuery.removeEventListener?.('change', handleDprChange);
      }

      if (typeof window.matchMedia !== 'function') {
        dprMediaQuery = null;
        return;
      }

      dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprMediaQuery.addEventListener?.('change', handleDprChange);
    };

    if (typeof window === 'undefined') {
      handleSizeChange();
      return;
    }

    handleSizeChange();
    watchDevicePixelRatio();
    window.addEventListener('resize', handleSizeChange);

    return () => {
      window.removeEventListener('resize', handleSizeChange);
      if (dprMediaQuery) {
        dprMediaQuery.removeEventListener?.('change', handleDprChange);
      }
    };
  }, [syncCanvasSize, requestRender]);

  return { dimensions, canvasSizeRef };
}
