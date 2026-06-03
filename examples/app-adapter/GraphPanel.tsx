import { GraphView } from '@afterglow/ograph';
import { toOGraphData, type MemoryGraph } from './adapter';

const memoryGraph: MemoryGraph = {
  memories: [
    {
      id: 'memory-1',
      title: 'Extract package boundary',
      createdAt: '2026-06-04T00:00:00.000Z',
      kind: 'memory'
    },
    {
      id: 'memory-2',
      title: 'Keep app data in adapters',
      createdAt: '2026-06-04T00:05:00.000Z',
      kind: 'memory'
    },
    {
      id: 'tag-package',
      title: '#package',
      createdAt: '2026-06-04T00:10:00.000Z',
      kind: 'tag'
    }
  ],
  links: [
    {
      id: 'link-1',
      fromMemoryId: 'memory-1',
      toMemoryId: 'memory-2',
      relation: 'related'
    },
    {
      id: 'link-2',
      fromMemoryId: 'memory-2',
      toMemoryId: 'tag-package',
      relation: 'tagged'
    }
  ]
};

const graph = toOGraphData(memoryGraph);

export function AppAdapterGraphPanel() {
  return (
    <div style={{ width: 900, height: 640 }}>
      <GraphView
        ariaLabel="Memory graph"
        nodes={graph.nodes}
        links={graph.links}
      />
    </div>
  );
}
