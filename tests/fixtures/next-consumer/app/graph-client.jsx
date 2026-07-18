'use client';

import { GraphView } from '@eunjjang/ograph';
import { useMemo, useState } from 'react';

const transparentTheme = {
  backgroundColor: 'rgba(0, 0, 0, 0)',
  fontFamily: 'system-ui, sans-serif',
  labelColor: 'rgba(216, 217, 223, 0.7)',
  labelHoverColor: '#ececf1',
  labelRootColor: '#8bd8b4',
  labelSelectedColor: '#8bd8b4',
  linkColor: 'rgba(255, 255, 255, 0.1)',
  linkHoverColor: 'rgba(118, 200, 255, 0.55)',
  linkNeighborColor: 'rgba(118, 200, 255, 0.34)',
  linkRootColor: 'rgba(139, 216, 180, 0.55)',
  linkSelectedColor: 'rgba(139, 216, 180, 0.55)',
  nodeAttachmentColor: '#84b8ff',
  nodeBorderColor: 'rgba(255, 255, 255, 0.1)',
  nodeBorderSelectedColor: '#8bd8b4',
  nodeDefaultColor: '#a9abb5',
  nodeHoverColor: '#ececf1',
  nodeHubColor: '#ffca7a',
  nodeNeighborColor: '#76c8ff',
  nodeNoteColor: '#d8d9df',
  nodeRootColor: '#8bd8b4',
  nodeSelectedColor: '#8bd8b4',
  nodeTagColor: '#9b73ff',
  nodeUnresolvedColor: '#ff6f86'
};

const graphPreset = {
  chargeStrength: -56,
  collisionRadius: 8,
  gravityStrength: 0.08,
  hoverDimming: 0.28,
  labelDensity: 0.48,
  linkDistance: 52,
  localGraphDepthBehavior: 2,
  nodeRadius: 4.4,
  nodeSizeScale: 1,
  selectionDimming: 0.18
};

function createFixture() {
  const nodes = Array.from({ length: 1000 }, (_, index) => ({
    id: `node-${index}`,
    label: `Node ${index}`,
    type: index % 29 === 0 ? 'hub' : index % 11 === 0 ? 'tag' : 'note',
    size: index % 29 === 0 ? 1.7 : 1
  }));
  const links = Array.from({ length: 2000 }, (_, index) => ({
    source: `node-${index % nodes.length}`,
    target: `node-${(index * 17 + 31) % nodes.length}`
  }));
  return { nodes, links };
}

export default function GraphClient() {
  const graph = useMemo(createFixture, []);
  const [errors, setErrors] = useState([]);

  return (
    <section className="consumer-shell">
      <div className="graph-panel" data-testid="graph-panel">
        <GraphView
          ariaLabel="Next production graph"
          links={graph.links}
          nodes={graph.nodes}
          preset={graphPreset}
          rootNodeId="node-0"
          selectedNodeId="node-0"
          style={{ height: '100%', width: '100%' }}
          theme={transparentTheme}
          onError={(error) => setErrors(current => [...current, error.message])}
        />
      </div>
      <output data-testid="event-errors">{errors.join('|') || 'none'}</output>
    </section>
  );
}
