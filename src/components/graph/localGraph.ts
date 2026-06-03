import type { GraphNode, GraphLink } from './types';

export interface GraphSubset {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface LocalGraphScope {
  visibleGraph: GraphSubset;
  physicsGraph: GraphSubset;
  visibleNodeIds: Set<string>;
  physicsNodeIds: Set<string>;
}

interface LocalTraversalIndex {
  existingNodeIds: Set<string>;
  adjacency: Map<string, Set<string>>;
}

interface NodeIdLookup {
  has(nodeId: string): boolean;
}

/**
 * Helper to extract direct string ID from d3-force's mutable source/target connections
 */
export function getLinkId(linkVal: string | GraphNode): string {
  if (typeof linkVal === 'object') {
    return linkVal.id;
  }
  return linkVal;
}

export function filterLinksByExistingNodes(links: GraphLink[], existingNodeIds: NodeIdLookup): GraphLink[] {
  return links.filter(link => {
    const sourceId = getLinkId(link.source);
    const targetId = getLinkId(link.target);

    return (
      sourceId !== targetId &&
      existingNodeIds.has(sourceId) &&
      existingNodeIds.has(targetId)
    );
  });
}

export function buildUndirectedAdjacency(links: GraphLink[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const link of links) {
    const sourceId = getLinkId(link.source);
    const targetId = getLinkId(link.target);

    if (sourceId === targetId) {
      continue;
    }

    if (!adjacency.has(sourceId)) adjacency.set(sourceId, new Set());
    if (!adjacency.has(targetId)) adjacency.set(targetId, new Set());

    adjacency.get(sourceId)!.add(targetId);
    adjacency.get(targetId)!.add(sourceId);
  }

  return adjacency;
}

function buildLocalTraversalIndex(nodes: GraphNode[], links: GraphLink[]): LocalTraversalIndex {
  const existingNodeIds = new Set(nodes.map(node => node.id));
  const adjacency = buildUndirectedAdjacency(filterLinksByExistingNodes(links, existingNodeIds));

  return { existingNodeIds, adjacency };
}

function collectNodeIdsWithinDepthFromIndex(
  index: LocalTraversalIndex,
  rootNodeId: string | null | undefined,
  depth: number
): Set<string> {
  if (!rootNodeId) {
    return new Set(index.existingNodeIds);
  }

  if (!index.existingNodeIds.has(rootNodeId)) {
    return new Set();
  }

  const visited = new Set<string>([rootNodeId]);
  let currentLevel = [rootNodeId];

  for (let step = 0; step < Math.max(0, depth); step++) {
    const nextLevel: string[] = [];

    for (const nodeId of currentLevel) {
      for (const neighborId of index.adjacency.get(nodeId) || []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        nextLevel.push(neighborId);
      }
    }

    currentLevel = nextLevel;
    if (currentLevel.length === 0) break;
  }

  return visited;
}

export function collectNodeIdsWithinDepth(
  nodes: GraphNode[],
  links: GraphLink[],
  rootNodeId: string | null | undefined,
  depth: number
): Set<string> {
  return collectNodeIdsWithinDepthFromIndex(
    buildLocalTraversalIndex(nodes, links),
    rootNodeId,
    depth
  );
}

export function filterGraphByNodeIds(
  nodes: GraphNode[],
  links: GraphLink[],
  nodeIds: ReadonlySet<string>
): GraphSubset {
  return {
    nodes: nodes.filter(node => nodeIds.has(node.id)),
    links: links.filter(link => {
      const sourceId = getLinkId(link.source);
      const targetId = getLinkId(link.target);

      return (
        sourceId !== targetId &&
        nodeIds.has(sourceId) &&
        nodeIds.has(targetId)
      );
    })
  };
}

export function mergeGraphScopes(
  nodes: GraphNode[],
  links: GraphLink[],
  firstNodeIds: ReadonlySet<string>,
  secondNodeIds: ReadonlySet<string>
): GraphSubset {
  return filterGraphByNodeIds(nodes, links, new Set([...firstNodeIds, ...secondNodeIds]));
}

/**
 * Local mode is a focus lens over the global layout. The visible graph is what
 * the user sees; the physics graph retains one hidden BFS ring for stability.
 */
export function buildLocalGraphScope(
  nodes: GraphNode[],
  links: GraphLink[],
  rootNodeId: string | null | undefined,
  depth: number,
  haloDepth = 1
): LocalGraphScope {
  const traversalIndex = buildLocalTraversalIndex(nodes, links);
  const visibleNodeIds = collectNodeIdsWithinDepthFromIndex(traversalIndex, rootNodeId, depth);
  const physicsNodeIds = collectNodeIdsWithinDepthFromIndex(
    traversalIndex,
    rootNodeId,
    depth + Math.max(0, haloDepth)
  );

  return {
    visibleGraph: filterGraphByNodeIds(nodes, links, visibleNodeIds),
    physicsGraph: filterGraphByNodeIds(nodes, links, physicsNodeIds),
    visibleNodeIds,
    physicsNodeIds
  };
}

/**
 * Performs Breadth-First Search (BFS) up to a max 'depth' starting from 'rootNodeId'.
 * Returns the scoped subset of nodes and links.
 */
export function filterLocalGraph(
  nodes: GraphNode[],
  links: GraphLink[],
  rootNodeId: string | null | undefined,
  depth: number
): GraphSubset {
  return filterGraphByNodeIds(
    nodes,
    links,
    collectNodeIdsWithinDepth(nodes, links, rootNodeId, depth)
  );
}
