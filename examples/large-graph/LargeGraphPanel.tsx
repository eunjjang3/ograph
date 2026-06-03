import { useMemo } from 'react';
import { GraphView } from '@afterglow/ograph';
import { createLargeGraph } from './createLargeGraph';

export function LargeGraphPanel() {
  const graph = useMemo(() => createLargeGraph(500, 1000), []);

  return (
    <div style={{ width: '100%', height: 720 }}>
      <GraphView
        ariaLabel="Large example graph"
        nodes={graph.nodes}
        links={graph.links}
      />
    </div>
  );
}
