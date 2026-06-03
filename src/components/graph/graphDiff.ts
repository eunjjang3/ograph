import type { GraphLink, GraphNode, GraphNodeMetadata } from './types';
import { getLinkId } from './localGraph';

const LINK_KEY_SEPARATOR = '\u0000';

export interface RemovedGraphLink<
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata
> {
  key: string;
  link: GraphLink<LinkMetadata, NodeMetadata>;
}

export interface GraphPatch<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
> {
  addedNodes: GraphNode<NodeMetadata>[];
  removedNodeIds: string[];
  updatedNodes: GraphNode<NodeMetadata>[];
  addedLinks: GraphLink<LinkMetadata, NodeMetadata>[];
  removedLinks: RemovedGraphLink<LinkMetadata, NodeMetadata>[];
  updatedLinks: GraphLink<LinkMetadata, NodeMetadata>[];
}

export interface DiffGraphOptions<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
> {
  areNodesEqual?: (previous: GraphNode<NodeMetadata>, next: GraphNode<NodeMetadata>) => boolean;
  areLinksEqual?: (
    previous: GraphLink<LinkMetadata, NodeMetadata>,
    next: GraphLink<LinkMetadata, NodeMetadata>
  ) => boolean;
}

interface LinkDiffEntry<
  LinkMetadata extends GraphNodeMetadata,
  NodeMetadata extends GraphNodeMetadata
> {
  key: string;
  link: GraphLink<LinkMetadata, NodeMetadata>;
}

function getLinkBaseKey(link: GraphLink): string {
  return `${getLinkId(link.source)}${LINK_KEY_SEPARATOR}${getLinkId(link.target)}`;
}

export function getGraphLinkDiffKey(link: GraphLink, occurrence: number): string {
  return `${getLinkBaseKey(link)}${LINK_KEY_SEPARATOR}${occurrence}`;
}

function mapNodesById<Metadata extends GraphNodeMetadata>(
  nodes: readonly GraphNode<Metadata>[]
): Map<string, GraphNode<Metadata>> {
  const nodeById = new Map<string, GraphNode<Metadata>>();

  for (const node of nodes) {
    if (!nodeById.has(node.id)) {
      nodeById.set(node.id, node);
    }
  }

  return nodeById;
}

function getLinkDiffEntries<
  LinkMetadata extends GraphNodeMetadata,
  NodeMetadata extends GraphNodeMetadata
>(
  links: readonly GraphLink<LinkMetadata, NodeMetadata>[]
): LinkDiffEntry<LinkMetadata, NodeMetadata>[] {
  const occurrenceByBaseKey = new Map<string, number>();

  return links.map(link => {
    const baseKey = getLinkBaseKey(link);
    const occurrence = occurrenceByBaseKey.get(baseKey) ?? 0;
    occurrenceByBaseKey.set(baseKey, occurrence + 1);

    return {
      key: getGraphLinkDiffKey(link, occurrence),
      link
    };
  });
}

function mapLinkEntriesByKey<
  LinkMetadata extends GraphNodeMetadata,
  NodeMetadata extends GraphNodeMetadata
>(
  entries: readonly LinkDiffEntry<LinkMetadata, NodeMetadata>[]
): Map<string, GraphLink<LinkMetadata, NodeMetadata>> {
  return new Map(entries.map(entry => [entry.key, entry.link]));
}

export function diffGraph<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
>(
  previous: {
    nodes: readonly GraphNode<NodeMetadata>[];
    links: readonly GraphLink<LinkMetadata, NodeMetadata>[];
  },
  next: {
    nodes: readonly GraphNode<NodeMetadata>[];
    links: readonly GraphLink<LinkMetadata, NodeMetadata>[];
  },
  options: DiffGraphOptions<NodeMetadata, LinkMetadata> = {}
): GraphPatch<NodeMetadata, LinkMetadata> {
  const areNodesEqual = options.areNodesEqual ?? Object.is;
  const areLinksEqual = options.areLinksEqual ?? Object.is;
  const previousNodesById = mapNodesById(previous.nodes);
  const nextNodesById = mapNodesById(next.nodes);
  const previousLinkEntries = getLinkDiffEntries(previous.links);
  const nextLinkEntries = getLinkDiffEntries(next.links);
  const previousLinksByKey = mapLinkEntriesByKey(previousLinkEntries);
  const nextLinksByKey = mapLinkEntriesByKey(nextLinkEntries);
  const addedNodes: GraphNode<NodeMetadata>[] = [];
  const removedNodeIds: string[] = [];
  const updatedNodes: GraphNode<NodeMetadata>[] = [];
  const addedLinks: GraphLink<LinkMetadata, NodeMetadata>[] = [];
  const removedLinks: RemovedGraphLink<LinkMetadata, NodeMetadata>[] = [];
  const updatedLinks: GraphLink<LinkMetadata, NodeMetadata>[] = [];

  for (const node of next.nodes) {
    const previousNode = previousNodesById.get(node.id);

    if (!previousNode) {
      addedNodes.push(node);
    } else if (!areNodesEqual(previousNode, node)) {
      updatedNodes.push(node);
    }
  }

  for (const node of previous.nodes) {
    if (!nextNodesById.has(node.id)) {
      removedNodeIds.push(node.id);
    }
  }

  for (const entry of nextLinkEntries) {
    const previousLink = previousLinksByKey.get(entry.key);

    if (!previousLink) {
      addedLinks.push(entry.link);
    } else if (!areLinksEqual(previousLink, entry.link)) {
      updatedLinks.push(entry.link);
    }
  }

  for (const entry of previousLinkEntries) {
    if (!nextLinksByKey.has(entry.key)) {
      removedLinks.push(entry);
    }
  }

  return {
    addedNodes,
    removedNodeIds,
    updatedNodes,
    addedLinks,
    removedLinks,
    updatedLinks
  };
}
