'use client';

import { GraphView } from '@eunjjang/ograph';
import { useMemo, useRef, useState } from 'react';

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

const opaqueTheme = {
  ...transparentTheme,
  backgroundColor: '#16161a'
};

const linkProbeColors = {
  linkColor: 'rgba(255, 0, 255, 0.8)',
  linkHoverColor: 'rgba(255, 0, 255, 0.8)',
  linkNeighborColor: 'rgba(255, 0, 255, 0.8)',
  linkRootColor: 'rgba(255, 0, 255, 0.8)',
  linkSelectedColor: 'rgba(255, 0, 255, 0.8)'
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

const occlusionProbePreset = {
  ...graphPreset,
  labelDensity: 0,
  nodeRadius: 32
};

const occlusionProbeTheme = {
  ...transparentTheme,
  ...linkProbeColors,
  nodeBorderColor: 'rgba(0, 0, 0, 0)',
  nodeDefaultColor: '#ffffff',
  nodeNoteColor: '#ffffff'
};

function createFixture(nodeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    label: `Node ${index}`,
    type: index % 29 === 0 ? 'hub' : index % 11 === 0 ? 'tag' : 'note',
    size: index % 29 === 0 ? 1.7 : 1
  }));
  const links = Array.from({ length: nodeCount * 2 }, (_, index) => ({
    source: `node-${index % nodes.length}`,
    target: `node-${(index * 17 + 31) % nodes.length}`
  }));
  return { nodes, links };
}

function createOcclusionProbeFixture() {
  return {
    nodes: [
      { id: 'occlusion-source', label: 'Source', type: 'note', x: -160, y: 0 },
      { id: 'occlusion-neighbor', label: 'Neighbor', type: 'note', x: 160, y: 0 },
      { id: 'occlusion-hover', label: 'Hover focus', type: 'note', x: 0, y: 0 }
    ],
    links: [
      { source: 'occlusion-source', target: 'occlusion-neighbor' }
    ]
  };
}

export default function GraphClient() {
  const [backgroundMode, setBackgroundMode] = useState('transparent');
  const [cameraFocused, setCameraFocused] = useState(false);
  const [errors, setErrors] = useState([]);
  const [focused, setFocused] = useState(true);
  const [linkProbe, setLinkProbe] = useState(false);
  const [nodeCount, setNodeCount] = useState(1000);
  const [occlusionProbe, setOcclusionProbe] = useState(false);
  const graphRef = useRef(null);
  const graph = useMemo(
    () => occlusionProbe ? createOcclusionProbeFixture() : createFixture(nodeCount),
    [nodeCount, occlusionProbe]
  );
  const theme = useMemo(() => {
    if (occlusionProbe) return occlusionProbeTheme;
    const baseTheme = backgroundMode === 'transparent' ? transparentTheme : opaqueTheme;
    return linkProbe ? { ...baseTheme, ...linkProbeColors } : baseTheme;
  }, [backgroundMode, linkProbe, occlusionProbe]);

  return (
    <section className="consumer-shell">
      <div className="consumer-controls">
        <button data-testid="toggle-background" onClick={() => (
          setBackgroundMode(current => current === 'transparent' ? 'opaque' : 'transparent')
        )}>
          Toggle background
        </button>
        <button data-testid="fixture-5000" onClick={() => setNodeCount(5000)}>
          Load 5k fixture
        </button>
        <button data-testid="toggle-focus" onClick={() => setFocused(current => !current)}>
          Toggle focus
        </button>
        <button data-testid="toggle-link-probe" onClick={() => setLinkProbe(current => !current)}>
          Toggle link probe
        </button>
        <button data-testid="toggle-occlusion-probe" onClick={() => (
          setOcclusionProbe(current => !current)
        )}>
          Toggle occlusion probe
        </button>
        <button data-testid="center-occlusion-probe" onClick={() => (
          setCameraFocused(graphRef.current?.focusCameraOnNode(
            'occlusion-source',
            { animated: false, scale: 1 }
          ) === true)
        )}>
          Center occlusion probe
        </button>
      </div>
      <div className="graph-panel" data-testid="graph-panel">
        <GraphView
          ariaLabel="Next production graph"
          hoveredNodeId={occlusionProbe ? 'occlusion-hover' : undefined}
          links={graph.links}
          nodes={graph.nodes}
          paused={occlusionProbe}
          preset={occlusionProbe ? occlusionProbePreset : graphPreset}
          ref={graphRef}
          rootNodeId={occlusionProbe ? null : focused ? 'node-0' : null}
          selectedNodeId={occlusionProbe ? null : focused ? 'node-0' : null}
          style={{ height: '100%', width: '100%' }}
          theme={theme}
          onError={(error) => setErrors(current => [...current, error.message])}
        />
      </div>
      <output data-testid="background-mode">{backgroundMode}</output>
      <output data-testid="fixture-size">{nodeCount}</output>
      <output data-testid="focus-mode">{focused ? 'selected-root' : 'none'}</output>
      <output data-testid="link-probe">{linkProbe ? 'on' : 'off'}</output>
      <output data-testid="occlusion-probe">{occlusionProbe ? 'on' : 'off'}</output>
      <output data-testid="camera-focused">{cameraFocused ? 'true' : 'false'}</output>
      <output data-testid="event-errors">{errors.join('|') || 'none'}</output>
    </section>
  );
}
