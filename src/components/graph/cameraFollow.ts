import type { GraphNode, GraphViewport } from './types';

/** Resolve from the same node coordinates that this frame will render. */
export function resolveCameraFollowViewport({
  nodeId, nodes, visibleNodeIds, viewport, width, height, suspended
}: {
  nodeId: string | null;
  nodes: readonly GraphNode[];
  visibleNodeIds: ReadonlySet<string>;
  viewport: GraphViewport;
  width: number;
  height: number;
  suspended: boolean;
}): GraphViewport | null {
  if (suspended || nodeId === null || !visibleNodeIds.has(nodeId)) return null;
  const node = nodes.find(candidate => candidate.id === nodeId);
  if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return null;
  const x = width / 2 - node.x! * viewport.scale;
  const y = height / 2 - node.y! * viewport.scale;
  if (x === viewport.x && y === viewport.y) return null;
  return { x, y, scale: viewport.scale };
}
