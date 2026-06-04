import type { GraphLink, GraphNode } from '@eunjjang/ograph';

export function createLargeGraph(
  nodeCount = 500,
  linkCount = 1000
): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const nodes: GraphNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    label: `Node ${index}`,
    type: index % 7 === 0 ? 'hub' : 'note'
  }));
  const links: GraphLink[] = [];

  for (let index = 0; index < linkCount; index += 1) {
    const source = index % nodeCount;
    let target = (index * 17 + 1) % nodeCount;

    if (target === source) {
      target = (target + 1) % nodeCount;
    }

    links.push({
      source: `node-${source}`,
      target: `node-${target}`
    });
  }

  return { nodes, links };
}
