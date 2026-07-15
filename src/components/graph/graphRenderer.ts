import type { GraphLink, GraphNode, GraphPreset, GraphTheme } from './types';
import type { Viewport } from './graphMath';
import type { GraphRendererMode } from './graphRuntime';
import type { GraphSpatialIndex } from './spatialIndex';
import { drawGraph } from './canvasRenderer';

export interface GraphRenderFrame {
  width: number;
  height: number;
  dpr: number;
  nodes: GraphNode[];
  links: GraphLink[];
  viewport: Viewport;
  theme: GraphTheme;
  preset: GraphPreset;
  selectedNodeId: string | null | undefined;
  hoveredNodeId: string | null | undefined;
  rootNodeId: string | null | undefined;
  neighbors: Set<string>;
  dimProgress: number;
  labelVisibilityByNodeId: Map<string, number>;
  lensVisibilityByNodeId: Map<string, number>;
  spatialIndex: GraphSpatialIndex;
  labelRenderBudget?: number;
}

export interface GraphRendererBackend {
  readonly kind: GraphRendererMode;
  initialize: (canvas: HTMLCanvasElement) => void | Promise<void>;
  render: (frame: GraphRenderFrame) => boolean;
  destroy: () => void;
}

class CanvasGraphRendererBackend implements GraphRendererBackend {
  readonly kind = 'canvas2d' as const;
  private canvas: HTMLCanvasElement | null = null;

  initialize(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  render(frame: GraphRenderFrame): boolean {
    const canvas = this.canvas;
    if (!canvas) return false;

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    try {
      ctx.scale(frame.dpr, frame.dpr);
      drawGraph(
        ctx,
        frame.width,
        frame.height,
        frame.nodes,
        frame.links,
        frame.viewport,
        frame.theme,
        frame.preset,
        frame.selectedNodeId,
        frame.hoveredNodeId,
        frame.rootNodeId,
        frame.neighbors,
        frame.dimProgress,
        frame.labelVisibilityByNodeId,
        frame.lensVisibilityByNodeId,
        frame.spatialIndex,
        frame.labelRenderBudget
      );
    } finally {
      ctx.restore();
    }

    return true;
  }

  destroy() {
    this.canvas = null;
  }
}

export function createGraphRendererBackend(kind: GraphRendererMode): GraphRendererBackend {
  if (kind === 'canvas2d') {
    return new CanvasGraphRendererBackend();
  }

  throw new Error('Pixi graph renderer is not initialized in this stage.');
}
