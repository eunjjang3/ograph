import type { GraphLink, GraphNode } from './types';
import { buildUndirectedAdjacency, filterLinksByExistingNodes, getLinkId } from './localGraph';

export interface GraphIndexes<NodeType extends GraphNode = GraphNode> {
  nodeById: Map<string, NodeType>;
  adjacencyById: Map<string, Set<string>>;
  degreeById: Map<string, number>;
  validLinks: GraphLink[];
}

export function buildGraphIndexes<NodeType extends GraphNode>(
  nodes: NodeType[],
  links: GraphLink[]
): GraphIndexes<NodeType> {
  const nodeById = new Map<string, NodeType>();
  const degreeById = new Map<string, number>();

  for (const node of nodes) {
    nodeById.set(node.id, node);
    degreeById.set(node.id, 0);
  }

  const validLinks = filterLinksByExistingNodes(links, nodeById);
  const adjacencyById = buildUndirectedAdjacency(validLinks);

  for (const link of validLinks) {
    const sourceId = getLinkId(link.source);
    const targetId = getLinkId(link.target);

    degreeById.set(sourceId, (degreeById.get(sourceId) || 0) + 1);
    degreeById.set(targetId, (degreeById.get(targetId) || 0) + 1);
  }

  return { nodeById, adjacencyById, degreeById, validLinks };
}

export function getFocusedNeighborSet(
  focusId: string | null | undefined,
  adjacencyById: Map<string, Set<string>>
): Set<string> {
  if (!focusId) {
    return new Set();
  }

  return new Set(adjacencyById.get(focusId) ?? []);
}
