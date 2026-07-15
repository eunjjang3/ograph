import {
  Application,
  Color,
  Container,
  Graphics,
  GraphicsContext,
  Sprite,
  Text,
  Texture
} from 'pixi.js';
import type { GraphLink, GraphNode, GraphPreset, GraphTheme } from './types';
import { getNodeRadius } from './graphMath';
import { getLinkId } from './localGraph';
import {
  getPaddedViewportWorldBounds,
  isLinkInBounds,
  querySpatialIndex
} from './spatialIndex';
import type {
  GraphRenderFrame,
  GraphRendererBackend,
  GraphRendererStats
} from './graphRenderer';
import {
  prioritizePixiNodeMaterialization,
  selectPixiLabelNodeIds,
  type PixiLabelCandidate
} from './pixiGraphPlanning';

const NODE_MATERIALIZATION_BUDGET = 420;
const LINK_MATERIALIZATION_BUDGET = 900;
const LABEL_MATERIALIZATION_BUDGET = 90;
const MAX_RETAINED_LABELS = 800;
const MAX_IDLE_LABELS = 600;
const MAX_INTERACTION_LABELS = 280;
const ALPHA_EPSILON = 0.001;

interface ResolvedColor {
  tint: number;
  alpha: number;
  red: number;
  green: number;
  blue: number;
}

interface PixiNodeView {
  fill: Graphics;
  border: Graphics;
}

interface PixiLabelView {
  text: Text;
  styleKey: string;
  lastUsedFrame: number;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mixChannel(left: number, right: number, progress: number) {
  return Math.round(left + (right - left) * progress);
}

function mixTint(left: ResolvedColor, right: ResolvedColor, progress: number) {
  const amount = clampUnit(progress);
  return (
    (mixChannel(left.red, right.red, amount) << 16) |
    (mixChannel(left.green, right.green, amount) << 8) |
    mixChannel(left.blue, right.blue, amount)
  );
}

function mixAlpha(left: ResolvedColor, right: ResolvedColor, progress: number) {
  const amount = clampUnit(progress);
  return left.alpha + (right.alpha - left.alpha) * amount;
}

function resolveLensNodeAlpha(nodeId: string, frame: GraphRenderFrame) {
  return frame.lensVisibilityByNodeId.get(nodeId) ?? 1;
}

function resolveLensLinkAlpha(sourceId: string, targetId: string, frame: GraphRenderFrame) {
  return Math.pow(
    Math.min(
      resolveLensNodeAlpha(sourceId, frame),
      resolveLensNodeAlpha(targetId, frame)
    ),
    1.6
  );
}

function resolveNodeBaseColor(node: GraphNode, theme: GraphTheme, rootNodeId: string | null | undefined) {
  if (node.id === rootNodeId) return theme.nodeRootColor;

  switch (node.type) {
    case 'note': return theme.nodeNoteColor;
    case 'tag': return theme.nodeTagColor;
    case 'attachment': return theme.nodeAttachmentColor;
    case 'unresolved': return theme.nodeUnresolvedColor;
    case 'hub':
    case 'structure':
    case 'domain':
      return theme.nodeHubColor;
    default:
      return theme.nodeDefaultColor;
  }
}

function resolveFocusDimAlpha(frame: GraphRenderFrame) {
  const focusId = frame.hoveredNodeId || frame.selectedNodeId;
  if (!focusId) return 1;

  const target = focusId === frame.hoveredNodeId
    ? frame.preset.hoverDimming
    : frame.preset.selectionDimming;
  return 1 + (target - 1) * clampUnit(frame.dimProgress);
}

function resolveLabelColor(
  node: GraphNode,
  frame: GraphRenderFrame,
  isNeighbor: boolean
) {
  if (node.id === frame.rootNodeId) return frame.theme.labelRootColor;
  if (node.id === frame.selectedNodeId) return frame.theme.labelSelectedColor;
  if (node.id === frame.hoveredNodeId) return frame.theme.labelHoverColor;
  if (isNeighbor) return frame.theme.labelSelectedColor;
  return frame.theme.labelColor;
}

class PixiGraphRendererBackend implements GraphRendererBackend {
  readonly kind = 'pixi' as const;

  private app: Application | null = null;
  private disposed = false;
  private world = new Container();
  private linkLayer = new Container();
  private nodeFillLayer = new Container();
  private nodeBorderLayer = new Container();
  private labelLayer = new Container();
  private nodeFillContext = new GraphicsContext().circle(0, 0, 1).fill(0xffffff);
  private nodeBorderContext = new GraphicsContext()
    .circle(0, 0, 1)
    .stroke({ color: 0xffffff, width: 0.16 });
  private nodeViews = new Map<string, PixiNodeView>();
  private linkViews = new Map<GraphLink, Sprite>();
  private labelViews = new Map<string, PixiLabelView>();
  private nodeById = new Map<string, GraphNode>();
  private pendingNodes: GraphNode[] = [];
  private pendingLinks: GraphLink[] = [];
  private labelsPending = false;
  private topologyNodes: GraphNode[] | null = null;
  private topologyLinks: GraphLink[] | null = null;
  private frameNumber = 0;
  private width = 0;
  private height = 0;
  private dpr = 0;
  private colorCache = new Map<string, ResolvedColor>();
  private stats: GraphRendererStats = {
    materializedNodes: 0,
    materializedLinks: 0,
    materializedLabels: 0,
    visibleNodes: 0,
    visibleLinks: 0,
    visibleLabels: 0
  };

  async initialize(canvas: HTMLCanvasElement) {
    const app = new Application();
    this.app = app;

    await app.init({
      canvas,
      width: Math.max(1, canvas.clientWidth || 1),
      height: Math.max(1, canvas.clientHeight || 1),
      resolution: Math.max(1, window.devicePixelRatio || 1),
      autoDensity: false,
      antialias: true,
      autoStart: false,
      sharedTicker: false,
      preference: ['webgl'],
      powerPreference: 'high-performance',
      backgroundAlpha: 1
    });

    if (this.disposed) {
      app.destroy(false, { children: true, context: true });
      this.app = null;
      return;
    }

    app.ticker.stop();
    this.world.eventMode = 'none';
    this.linkLayer.eventMode = 'none';
    this.nodeFillLayer.eventMode = 'none';
    this.nodeBorderLayer.eventMode = 'none';
    this.labelLayer.eventMode = 'none';
    this.world.addChild(this.linkLayer, this.nodeFillLayer, this.nodeBorderLayer);
    app.stage.addChild(this.world, this.labelLayer);
  }

  private resolveColor(value: string): ResolvedColor {
    const cached = this.colorCache.get(value);
    if (cached) return cached;

    let color: Color;
    try {
      color = new Color(value);
    } catch {
      color = new Color(0xffffff);
    }

    const resolved = {
      tint: color.toNumber(),
      alpha: color.alpha,
      red: Math.round(color.red * 255),
      green: Math.round(color.green * 255),
      blue: Math.round(color.blue * 255)
    };
    this.colorCache.set(value, resolved);
    return resolved;
  }

  private clearTopology() {
    for (const view of this.nodeViews.values()) {
      view.fill.destroy();
      view.border.destroy();
    }
    for (const sprite of this.linkViews.values()) sprite.destroy();
    for (const view of this.labelViews.values()) view.text.destroy();

    this.nodeViews.clear();
    this.linkViews.clear();
    this.labelViews.clear();
    this.nodeById.clear();
    this.linkLayer.removeChildren();
    this.nodeFillLayer.removeChildren();
    this.nodeBorderLayer.removeChildren();
    this.labelLayer.removeChildren();
  }

  private resetTopology(frame: GraphRenderFrame) {
    this.clearTopology();
    this.topologyNodes = frame.nodes;
    this.topologyLinks = frame.links;
    this.nodeById = new Map(frame.nodes.map(node => [node.id, node]));
    this.pendingNodes = prioritizePixiNodeMaterialization(
      frame.nodes,
      frame.spatialIndex,
      frame.width,
      frame.height,
      frame.viewport
    );
    this.pendingLinks = [...frame.links];
    this.labelsPending = true;
  }

  private materializeNode(node: GraphNode) {
    if (this.nodeViews.has(node.id)) return;

    const fill = new Graphics(this.nodeFillContext);
    const border = new Graphics(this.nodeBorderContext);
    fill.eventMode = 'none';
    border.eventMode = 'none';
    fill.visible = false;
    border.visible = false;
    this.nodeFillLayer.addChild(fill);
    this.nodeBorderLayer.addChild(border);
    this.nodeViews.set(node.id, { fill, border });
  }

  private materializeNodes(frame: GraphRenderFrame, visibleNodes: GraphNode[]) {
    // pendingNodes empties only after every topology node owns retained views.
    // Avoid rechecking every settled visible node on subsequent active frames.
    if (this.pendingNodes.length === 0) return;

    let remaining = NODE_MATERIALIZATION_BUDGET;

    for (const node of visibleNodes) {
      if (remaining === 0) break;
      if (this.nodeViews.has(node.id)) continue;
      this.materializeNode(node);
      remaining -= 1;
    }

    while (remaining > 0 && this.pendingNodes.length > 0) {
      const node = this.pendingNodes.shift()!;
      if (this.nodeViews.has(node.id)) continue;
      this.materializeNode(node);
      remaining -= 1;
    }
  }

  private materializeLink(link: GraphLink) {
    if (this.linkViews.has(link)) return false;

    const sourceId = getLinkId(link.source);
    const targetId = getLinkId(link.target);
    if (!this.nodeViews.has(sourceId) || !this.nodeViews.has(targetId)) return false;

    const sprite = new Sprite({ texture: Texture.WHITE, anchor: { x: 0, y: 0.5 } });
    sprite.eventMode = 'none';
    sprite.visible = false;
    this.linkLayer.addChild(sprite);
    this.linkViews.set(link, sprite);
    return true;
  }

  private materializeLinks(frame: GraphRenderFrame) {
    // pendingLinks empties only after every topology link owns a retained view.
    // Avoid rescanning the complete settled topology on every active frame.
    if (this.pendingLinks.length === 0) return;

    let remaining = LINK_MATERIALIZATION_BUDGET;
    const bounds = getPaddedViewportWorldBounds(frame.width, frame.height, frame.viewport);

    for (const link of frame.links) {
      if (remaining === 0) break;
      if (this.linkViews.has(link) || !isLinkInBounds(link, bounds)) continue;
      if (this.materializeLink(link)) remaining -= 1;
    }

    const attempts = this.pendingLinks.length;
    for (let index = 0; index < attempts && remaining > 0; index += 1) {
      const link = this.pendingLinks.shift()!;
      if (this.linkViews.has(link)) continue;
      if (this.materializeLink(link)) {
        remaining -= 1;
      } else {
        this.pendingLinks.push(link);
      }
    }
  }

  private updateNodeViews(frame: GraphRenderFrame, visibleNodeIds: Set<string>) {
    const focusId = frame.hoveredNodeId || frame.selectedNodeId;
    const hasFocus = !!focusId;
    const focusProgress = clampUnit(frame.dimProgress);
    const dimAlpha = resolveFocusDimAlpha(frame);
    let visibleCount = 0;

    for (const [nodeId, view] of this.nodeViews) {
      const node = this.nodeById.get(nodeId);
      if (!node || !visibleNodeIds.has(nodeId)) {
        view.fill.visible = false;
        view.border.visible = false;
        continue;
      }

      const lensAlpha = resolveLensNodeAlpha(nodeId, frame);
      if (lensAlpha <= ALPHA_EPSILON) {
        view.fill.visible = false;
        view.border.visible = false;
        continue;
      }

      const baseColor = this.resolveColor(resolveNodeBaseColor(node, frame.theme, frame.rootNodeId));
      let overlayColor: ResolvedColor | null = null;
      let nodeAlpha = 1;

      if (nodeId !== frame.rootNodeId) {
        if (nodeId === frame.hoveredNodeId) {
          overlayColor = this.resolveColor(frame.theme.nodeHoverColor);
        } else if (nodeId === frame.selectedNodeId) {
          overlayColor = this.resolveColor(frame.theme.nodeSelectedColor);
        } else if (hasFocus && frame.neighbors.has(nodeId)) {
          overlayColor = this.resolveColor(frame.theme.nodeNeighborColor);
        } else if (hasFocus) {
          nodeAlpha = dimAlpha;
        }
      }

      const radius = getNodeRadius(
        frame.preset.nodeRadius,
        frame.preset.nodeSizeScale ?? 1,
        node.size,
        node.degree
      );
      const isFocusedNode = nodeId === frame.hoveredNodeId || nodeId === frame.selectedNodeId;
      const borderColor = this.resolveColor(
        isFocusedNode ? frame.theme.nodeBorderSelectedColor : frame.theme.nodeBorderColor
      );
      const positionX = node.x ?? 0;
      const positionY = node.y ?? 0;

      view.fill.position.set(positionX, positionY);
      view.fill.scale.set(radius);
      view.fill.tint = overlayColor
        ? mixTint(baseColor, overlayColor, focusProgress)
        : baseColor.tint;
      view.fill.alpha = (
        overlayColor ? mixAlpha(baseColor, overlayColor, focusProgress) : baseColor.alpha
      ) * nodeAlpha * lensAlpha;
      view.fill.visible = view.fill.alpha > ALPHA_EPSILON;

      view.border.position.set(positionX, positionY);
      view.border.scale.set(radius + (isFocusedNode ? 1.5 / frame.viewport.scale : 0));
      view.border.tint = borderColor.tint;
      view.border.alpha = borderColor.alpha * (isFocusedNode ? focusProgress : nodeAlpha) * lensAlpha;
      view.border.visible = view.border.alpha > ALPHA_EPSILON;
      visibleCount += 1;
    }

    return visibleCount;
  }

  private updateLinkViews(frame: GraphRenderFrame) {
    const focusId = frame.hoveredNodeId || frame.selectedNodeId;
    const hasFocus = !!focusId;
    const focusProgress = clampUnit(frame.dimProgress);
    const dimAlpha = resolveFocusDimAlpha(frame);
    const bounds = getPaddedViewportWorldBounds(frame.width, frame.height, frame.viewport);
    const lineWidth = 1.1 / Math.max(0.6, Math.min(frame.viewport.scale, 2));
    let visibleCount = 0;

    for (const [link, sprite] of this.linkViews) {
      const source = typeof link.source === 'object' ? link.source : null;
      const target = typeof link.target === 'object' ? link.target : null;
      if (!source || !target || !isLinkInBounds(link, bounds)) {
        sprite.visible = false;
        continue;
      }

      const sourceId = source.id;
      const targetId = target.id;
      const lensAlpha = resolveLensLinkAlpha(sourceId, targetId, frame);
      if (lensAlpha <= ALPHA_EPSILON) {
        sprite.visible = false;
        continue;
      }

      let baseColor = this.resolveColor(frame.theme.linkColor);
      let overlayColor: ResolvedColor | null = null;
      let alphaScale = 1;

      if (hasFocus) {
        const connected = sourceId === focusId || targetId === focusId;
        if (connected) {
          if (sourceId === frame.hoveredNodeId || targetId === frame.hoveredNodeId) {
            overlayColor = this.resolveColor(frame.theme.linkHoverColor);
          } else if (sourceId === frame.selectedNodeId || targetId === frame.selectedNodeId) {
            overlayColor = this.resolveColor(frame.theme.linkSelectedColor);
          } else {
            overlayColor = this.resolveColor(frame.theme.linkNeighborColor);
          }
        } else if (
          (sourceId === frame.rootNodeId && frame.neighbors.has(targetId)) ||
          (targetId === frame.rootNodeId && frame.neighbors.has(sourceId))
        ) {
          overlayColor = this.resolveColor(frame.theme.linkRootColor);
        } else {
          alphaScale = dimAlpha;
        }
      } else if (sourceId === frame.rootNodeId || targetId === frame.rootNodeId) {
        baseColor = this.resolveColor(frame.theme.linkRootColor);
      }

      const sourceX = source.x ?? 0;
      const sourceY = source.y ?? 0;
      const dx = (target.x ?? 0) - sourceX;
      const dy = (target.y ?? 0) - sourceY;
      const length = Math.hypot(dx, dy);

      sprite.position.set(sourceX, sourceY);
      sprite.rotation = Math.atan2(dy, dx);
      sprite.width = Math.max(0.001, length);
      sprite.height = lineWidth;
      sprite.tint = overlayColor
        ? mixTint(baseColor, overlayColor, focusProgress)
        : baseColor.tint;
      sprite.alpha = (
        overlayColor ? mixAlpha(baseColor, overlayColor, focusProgress) : baseColor.alpha
      ) * alphaScale * lensAlpha;
      sprite.visible = sprite.alpha > ALPHA_EPSILON;
      visibleCount += 1;
    }

    return visibleCount;
  }

  private evictOldestHiddenLabel() {
    let oldestId: string | null = null;
    let oldestFrame = Infinity;

    for (const [nodeId, view] of this.labelViews) {
      if (!view.text.visible && view.lastUsedFrame < oldestFrame) {
        oldestId = nodeId;
        oldestFrame = view.lastUsedFrame;
      }
    }

    if (!oldestId) return false;
    const view = this.labelViews.get(oldestId)!;
    view.text.destroy();
    this.labelViews.delete(oldestId);
    return true;
  }

  private createLabelView(node: GraphNode, frame: GraphRenderFrame, color: string) {
    while (this.labelViews.size >= MAX_RETAINED_LABELS) {
      if (!this.evictOldestHiddenLabel()) return null;
    }

    const styleKey = `${frame.theme.fontFamily}|${color}|${frame.theme.backgroundColor}`;
    const text = new Text({
      text: node.label,
      anchor: { x: 0.5, y: 0 },
      resolution: frame.dpr,
      roundPixels: true,
      style: {
        fontFamily: frame.theme.fontFamily,
        fontSize: 11,
        fill: color,
        stroke: { color: frame.theme.backgroundColor, width: 3.5, join: 'round' },
        align: 'center'
      }
    });
    text.eventMode = 'none';
    this.labelLayer.addChild(text);
    const view = { text, styleKey, lastUsedFrame: this.frameNumber };
    this.labelViews.set(node.id, view);
    return view;
  }

  private updateLabelViews(frame: GraphRenderFrame, visibleNodes: GraphNode[]) {
    for (const view of this.labelViews.values()) view.text.visible = false;

    const focusId = frame.hoveredNodeId || frame.selectedNodeId;
    const hasFocus = !!focusId;
    const dimAlpha = resolveFocusDimAlpha(frame);
    const candidates: PixiLabelCandidate[] = [];
    const nodeById = new Map<string, GraphNode>();

    for (let index = 0; index < visibleNodes.length; index += 1) {
      const node = visibleNodes[index]!;
      const lensAlpha = resolveLensNodeAlpha(node.id, frame);
      if (lensAlpha <= ALPHA_EPSILON) continue;

      const isNeighbor = hasFocus && frame.neighbors.has(node.id);
      const forceVisible =
        node.id === frame.hoveredNodeId ||
        node.id === frame.selectedNodeId ||
        node.id === frame.rootNodeId;
      const visibility = frame.labelVisibilityByNodeId.get(node.id) ?? 0;
      if (visibility <= ALPHA_EPSILON && !forceVisible) continue;

      nodeById.set(node.id, node);
      candidates.push({
        id: node.id,
        inputIndex: index,
        visibility: visibility * lensAlpha,
        degree: Number.isFinite(node.degree) ? Math.max(0, node.degree ?? 0) : 0,
        forceVisible,
        isNeighbor
      });
    }

    const configuredBudget = frame.labelRenderBudget;
    const labelBudget = configuredBudget ?? (hasFocus ? MAX_INTERACTION_LABELS : MAX_IDLE_LABELS);
    const selectedIds = selectPixiLabelNodeIds(candidates, labelBudget);
    let remainingMaterialization = LABEL_MATERIALIZATION_BUDGET;
    let visibleCount = 0;
    this.labelsPending = false;

    for (const candidate of candidates) {
      if (!selectedIds.has(candidate.id)) continue;
      const node = nodeById.get(candidate.id)!;
      const color = resolveLabelColor(node, frame, candidate.isNeighbor);
      const styleKey = `${frame.theme.fontFamily}|${color}|${frame.theme.backgroundColor}`;
      let view = this.labelViews.get(candidate.id);

      if (!view) {
        if (remainingMaterialization === 0) {
          this.labelsPending = true;
          continue;
        }
        view = this.createLabelView(node, frame, color) ?? undefined;
        if (!view) {
          this.labelsPending = true;
          continue;
        }
        remainingMaterialization -= 1;
      }

      if (view.text.text !== node.label) view.text.text = node.label;
      if (view.styleKey !== styleKey) {
        view.text.style = {
          fontFamily: frame.theme.fontFamily,
          fontSize: 11,
          fill: color,
          stroke: { color: frame.theme.backgroundColor, width: 3.5, join: 'round' },
          align: 'center'
        };
        view.styleKey = styleKey;
      }

      const radius = getNodeRadius(
        frame.preset.nodeRadius,
        frame.preset.nodeSizeScale ?? 1,
        node.size,
        node.degree
      );
      const lensAlpha = resolveLensNodeAlpha(node.id, frame);
      const isSemanticallyNearFocus =
        candidate.forceVisible ||
        candidate.isNeighbor ||
        node.id === frame.rootNodeId;
      const labelDimAlpha = hasFocus && !isSemanticallyNearFocus ? dimAlpha : 1;
      view.text.position.set(
        frame.viewport.x + (node.x ?? 0) * frame.viewport.scale,
        frame.viewport.y + (node.y ?? 0) * frame.viewport.scale + radius * frame.viewport.scale + 3.5
      );
      view.text.alpha = candidate.visibility * labelDimAlpha;
      view.text.visible = view.text.alpha > ALPHA_EPSILON;
      view.lastUsedFrame = this.frameNumber;
      if (view.text.visible) visibleCount += 1;
    }

    return visibleCount;
  }

  render(frame: GraphRenderFrame) {
    const app = this.app;
    if (!app || this.disposed) return false;

    this.frameNumber += 1;
    if (this.width !== frame.width || this.height !== frame.height || this.dpr !== frame.dpr) {
      this.width = frame.width;
      this.height = frame.height;
      this.dpr = frame.dpr;
      app.renderer.resize(frame.width, frame.height, frame.dpr);
    }
    app.renderer.background.color = frame.theme.backgroundColor;
    app.renderer.background.alpha = 1;

    if (this.topologyNodes !== frame.nodes || this.topologyLinks !== frame.links) {
      this.resetTopology(frame);
    }

    const bounds = getPaddedViewportWorldBounds(frame.width, frame.height, frame.viewport);
    const visibleNodes = querySpatialIndex(frame.spatialIndex, bounds);
    const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
    this.materializeNodes(frame, visibleNodes);
    this.materializeLinks(frame);

    this.world.position.set(frame.viewport.x, frame.viewport.y);
    this.world.scale.set(frame.viewport.scale);
    const visibleLinks = this.updateLinkViews(frame);
    const visibleNodeCount = this.updateNodeViews(frame, visibleNodeIds);
    const visibleLabels = this.updateLabelViews(frame, visibleNodes);

    app.render();
    this.stats = {
      materializedNodes: this.nodeViews.size,
      materializedLinks: this.linkViews.size,
      materializedLabels: this.labelViews.size,
      visibleNodes: visibleNodeCount,
      visibleLinks,
      visibleLabels
    };
    return true;
  }

  getStats() {
    return this.stats;
  }

  hasPendingWork() {
    return this.pendingNodes.length > 0 || this.pendingLinks.length > 0 || this.labelsPending;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTopology();
    this.nodeFillContext.destroy();
    this.nodeBorderContext.destroy();
    this.app?.destroy(false, { children: true, context: true });
    this.app = null;
  }
}

export function createPixiGraphRendererBackend(): GraphRendererBackend {
  return new PixiGraphRendererBackend();
}
