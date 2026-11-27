import { useRef, useState } from 'react';
import { GraphView, type GraphViewRef, type GraphNode, type GraphViewport } from '@eunjjang/ograph';

export function CameraControls() {
  const ref = useRef<GraphViewRef>(null);
  const [autoFit, setAutoFit] = useState(false);
  const [paused, setPaused] = useState(false);
  const [linked, setLinked] = useState(false);
  const [nodes, setNodes] = useState<GraphNode[]>([
    { id: 'target', label: 'Target', x: 600, y: 400 }, { id: 'other', label: 'Other', x: -400, y: -300 }
  ]);
  const links = linked ? [{ source: 'target', target: 'other' }] : [];
  const [chargeStrength, setChargeStrength] = useState(-50);
  const [mounted, setMounted] = useState(true);
  const [revision, setRevision] = useState(0);
  const [viewport, setViewport] = useState<GraphViewport>({ x: 0, y: 0, scale: 0 });
  const [clicked, setClicked] = useState('');
  return <>
    <button onClick={() => ref.current?.focusCameraOnNode('target', { animated: false, scale: 1.75 })}>Focus</button>
    <button onClick={() => ref.current?.setCameraFollowNodeId('target')}>Follow</button>
    <button onClick={() => ref.current?.setCameraFollowNodeId(null)}>Stop</button>
    <button onClick={() => setNodes(current => [...current, { id: 'new-' + current.length, label: 'New', x: -900, y: 500 }])}>Add</button>
    <button onClick={() => setRevision(value => value + 1)}>Rerender</button>
    <button onClick={() => setNodes(current => current.map(node => ({ ...node, label: node.label + ' renamed', metadata: { updated: true } })))}>Rename</button>
    <button onClick={() => setNodes(current => current.map(node => ({ ...node, size: (node.size ?? 1) + 1 })))}>Resize nodes</button>
    <button onClick={() => setChargeStrength(value => value - 10)}>Physics</button>
    <button onClick={() => setMounted(value => !value)}>Mount</button>
    <button onClick={() => setLinked(value => !value)}>Link</button>
    <button onClick={() => setAutoFit(value => !value)}>Auto</button>
    <button onClick={() => setPaused(value => !value)}>Pause</button>
    <button onClick={() => ref.current?.fitToView()}>Fit</button>
    <button onClick={() => ref.current?.resetViewport()}>Reset</button>
    <output data-testid="camera-viewport">{JSON.stringify(viewport)}</output>
    <output data-testid="camera-clicked">{clicked}</output>
    <output data-testid="camera-revision">{revision}</output>
    <div style={{ width: 760, height: 520 }}>
      {mounted && <GraphView ref={ref} nodes={nodes.map(node => ({ ...node }))} links={links}
        preset={{ chargeStrength }}
        autoFit={autoFit} paused={paused} onViewportChange={setViewport} onNodeClick={node => setClicked(node.id + ":" + node.label + ":" + String(node.metadata?.updated))} />}
    </div>
  </>;
}
