import type { GraphLink, GraphNode } from '@eunjjang/ograph';

export interface MemoryRecord {
  id: string;
  title: string;
  createdAt: string;
  kind: 'memory' | 'tag';
}

export interface MemoryLinkRecord {
  id: string;
  fromMemoryId: string;
  toMemoryId: string;
  relation: 'related' | 'tagged';
}

export interface MemoryGraph {
  memories: MemoryRecord[];
  links: MemoryLinkRecord[];
}

export type MemoryNodeMetadata = {
  kind: MemoryRecord['kind'];
  createdAt: string;
};

export type MemoryLinkMetadata = {
  relation: MemoryLinkRecord['relation'];
};

export function toOGraphData(memoryGraph: MemoryGraph): {
  nodes: GraphNode<MemoryNodeMetadata>[];
  links: GraphLink<MemoryLinkMetadata, MemoryNodeMetadata>[];
} {
  return {
    nodes: memoryGraph.memories.map(memory => ({
      id: memory.id,
      label: memory.title,
      type: memory.kind === 'tag' ? 'tag' : 'note',
      metadata: {
        kind: memory.kind,
        createdAt: memory.createdAt
      }
    })),
    links: memoryGraph.links.map(link => ({
      source: link.fromMemoryId,
      target: link.toMemoryId,
      metadata: {
        relation: link.relation
      }
    }))
  };
}
