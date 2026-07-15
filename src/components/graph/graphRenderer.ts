import type { GraphLink, GraphNode, GraphPreset, GraphTheme } from './types';
import type { Viewport } from './graphMath';
import type { GraphRendererFrameProfile, GraphRendererMode } from './graphRuntime';
import type { GraphSpatialIndex } from './spatialIndex';
import { drawGraph } from './canvasRenderer';

declare const __OGRAPH_DEBUG_RUNTIME__: boolean;

export interface GraphRendererStats {
  materializedNodes: number;
  materializedLinks: number;
  materializedLabels: number;
  visibleNodes: number;
  visibleLinks: number;
  visibleLabels: number;
  lastFrameProfile?: GraphRendererFrameProfile;
}

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
  neighbors: ReadonlySet<string>;
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
  getStats?: () => GraphRendererStats;
  hasPendingWork?: () => boolean;
}

class CanvasGraphRendererBackend implements GraphRendererBackend {
  readonly kind = 'canvas2d' as const;
  private canvas: HTMLCanvasElement | null = null;
  private stats: GraphRendererStats = {
    materializedNodes: 0,
    materializedLinks: 0,
    materializedLabels: 0,
    visibleNodes: 0,
    visibleLinks: 0,
    visibleLabels: 0
  };

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

    if (__OGRAPH_DEBUG_RUNTIME__) {
      this.stats = {
        materializedNodes: frame.nodes.length,
        materializedLinks: frame.links.length,
        materializedLabels: frame.labelVisibilityByNodeId.size,
        visibleNodes: frame.nodes.length,
        visibleLinks: frame.links.length,
        visibleLabels: frame.labelVisibilityByNodeId.size
      };
    }

    return true;
  }

  getStats() {
    return this.stats;
  }

  destroy() {
    this.canvas = null;
  }
}

type PixiBackendLoader = () => Promise<GraphRendererBackend>;

async function loadPixiGraphRendererBackend() {
  const { createPixiGraphRendererBackend } = await import('./pixiGraphRenderer');
  return createPixiGraphRendererBackend();
}

export class LazyPixiGraphRendererBackend implements GraphRendererBackend {
  readonly kind = 'pixi' as const;
  private backend: GraphRendererBackend | null = null;
  private disposed = false;

  constructor(
    private readonly loadBackend: PixiBackendLoader = loadPixiGraphRendererBackend
  ) {}

  async initialize(canvas: HTMLCanvasElement) {
    if (!__OGRAPH_DEBUG_RUNTIME__) {
      throw new Error('Pixi graph rendering is available only in the debug harness.');
    }

    const backend = await this.loadBackend();
    if (this.disposed) {
      backend.destroy();
      return;
    }

    try {
      await backend.initialize(canvas);
    } catch (caught) {
      backend.destroy();
      throw caught;
    }

    if (this.disposed) {
      backend.destroy();
      return;
    }

    // Do not expose the concrete renderer until its asynchronous Pixi
    // Application initialization is complete. Render requests can arrive while
    // WebGL is still being created; delegating before this point would observe
    // an Application whose renderer has not been installed yet.
    this.backend = backend;
  }

  render(frame: GraphRenderFrame) {
    return this.backend?.render(frame) ?? false;
  }

  getStats() {
    return this.backend?.getStats?.() ?? {
      materializedNodes: 0,
      materializedLinks: 0,
      materializedLabels: 0,
      visibleNodes: 0,
      visibleLinks: 0,
      visibleLabels: 0
    };
  }

  hasPendingWork() {
    return this.backend?.hasPendingWork?.() ?? false;
  }

  destroy() {
    this.disposed = true;
    this.backend?.destroy();
    this.backend = null;
  }
}

export function createGraphRendererBackend(kind: GraphRendererMode): GraphRendererBackend {
  if (kind === 'canvas2d') {
    return new CanvasGraphRendererBackend();
  }

  if (__OGRAPH_DEBUG_RUNTIME__) {
    return new LazyPixiGraphRendererBackend();
  }

  throw new Error('Unsupported graph renderer.');
}
