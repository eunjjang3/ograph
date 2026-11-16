import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Expand, CodeXml, MoveUpRight, Pause, Play, RotateCcw, Share2 } from 'lucide-react';
import { GraphView, type GraphNode, type GraphPhysicsPresetName, type GraphTheme, type GraphViewRef } from '../components/graph';
import { generateMockGraphData } from '../components/graph/debug/generateMockGraphData';
import { createNotebookGraph } from './demoGraph';
import './playground.css';

const repo = 'https://github.com/eunjjang3/ograph';
const motions: { id: GraphPhysicsPresetName; label: string; description: string }[] = [
  { id: 'obsidian', label: 'Smooth', description: 'Connected movement. A soft, gradual stop.' },
  { id: 'calm', label: 'Calm', description: 'Gentle response with a shorter settling tail.' },
  { id: 'lively', label: 'Lively', description: 'More energy, with a little longer to wander.' },
  { id: 'legacy', label: 'Legacy', description: 'Stronger springs and the earlier force settings.' }
];
const themes: Record<string, Partial<GraphTheme>> = {
  midnight: { backgroundColor: '#111a1b', nodeNoteColor: '#becac7', nodeHubColor: '#cbe89e', nodeTagColor: '#a59adb', nodeAttachmentColor: '#e3b68e', nodeSelectedColor: '#ffffff', nodeRootColor: '#cbe89e', linkColor: 'rgba(174, 201, 190, 0.24)', labelColor: 'rgba(213, 226, 220, 0.72)' },
  paper: { backgroundColor: '#f1f0e9', nodeNoteColor: '#62766b', nodeHubColor: '#416045', nodeTagColor: '#8472ad', nodeAttachmentColor: '#b67e54', nodeBorderColor: '#f1f0e9', nodeSelectedColor: '#1b3328', nodeHoverColor: '#17281f', nodeRootColor: '#416045', nodeNeighborColor: '#62766b', labelRootColor: '#35523b', linkColor: 'rgba(58, 77, 64, 0.22)', linkHoverColor: 'rgba(58, 77, 64, 0.6)', labelColor: 'rgba(42, 57, 47, 0.8)' },
  ember: { backgroundColor: '#241b1b', nodeNoteColor: '#c9b7ad', nodeHubColor: '#eab191', nodeTagColor: '#bea0bd', nodeAttachmentColor: '#d8c18e', nodeBorderColor: '#241b1b', nodeRootColor: '#eab191', linkColor: 'rgba(212, 170, 148, 0.25)', labelColor: 'rgba(235, 210, 194, 0.74)' }
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  return <button type="button" className="pg-copy" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setStatus('copied'); }
    catch { setStatus('error'); }
  }} aria-label={status === 'copied' ? 'Copied to clipboard' : label} title={label}>
    {status === 'copied' ? <Check size={15} /> : <Copy size={15} />}
    <span aria-live="polite">{status === 'copied' ? 'Copied' : status === 'error' ? 'Select text to copy' : 'Copy'}</span>
  </button>;
}

export function GraphPlayground() {
  const graphRef = useRef<GraphViewRef>(null);
  const [scene, setScene] = useState('notebook');
  const [motion, setMotion] = useState<GraphPhysicsPresetName>('obsidian');
  const [theme, setTheme] = useState('midnight');
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [root, setRoot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      // Fit this demo's scene after GraphView has measured its resized container.
      frame = requestAnimationFrame(() => graphRef.current?.fitToView());
    });
    if (canvasContainerRef.current) observer.observe(canvasContainerRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [scene]);
  const graph = useMemo(() => scene === 'notebook' ? createNotebookGraph() : generateMockGraphData(Number(scene), 2.5, 42), [scene]);
  const selectedNode = graph.nodes.find(node => node.id === selected);
  const preset = useMemo(() => ({ physicsPreset: motion, nodeRadius: 3.5, labelDensity: scene === 'notebook' ? .22 : .12 }), [motion, scene]);
  const snippet = `<GraphView\n  nodes={nodes}\n  links={links}\n  preset={{ physicsPreset: '${motion}' }}\n/>`;
  const explore = (node: GraphNode) => { setSelected(node.id); setRoot(node.id); };

  return <div className="pg-shell">
    <header className="pg-header">
      <a href="#" className="pg-brand" aria-label="Ograph playground"><Share2 size={24} strokeWidth={1.6} /><span>ograph<span className="pg-brand-dot">.</span></span></a>
      <span className="pg-version">v{import.meta.env.VITE_OGRAPH_VERSION}</span>
      <nav aria-label="Main navigation">
        <a href={`${repo}/blob/main/docs/api.md`} target="_blank" rel="noreferrer">Documentation <ArrowUpRight size={13} /></a>
        <a href="#debug">Debug lab <ArrowUpRight size={13} /></a>
        <a href={repo} target="_blank" rel="noreferrer" aria-label="Ograph on GitHub"><CodeXml size={19} /></a>
      </nav>
    </header>

    <main className="pg-main">
      <section className="pg-intro" aria-labelledby="pg-title">
        <div><p className="pg-eyebrow"><span /> INTERACTIVE GRAPH PLAYGROUND</p><h1 id="pg-title">Ideas move better together.</h1></div>
        <p>A little structure. A little motion.<br />Grab a node and follow the connections.</p>
      </section>
      <div className="pg-workspace">
        <section className={`pg-stage pg-stage-${theme}`} aria-label="Interactive graph preview">
          <div className="pg-stage-heading"><span>{root ? 'Neighborhood view' : scene === 'notebook' ? 'A connected notebook' : 'A larger network'}</span><span>{graph.nodes.length.toLocaleString()} nodes · {graph.links.length.toLocaleString()} links{root ? ' · full dataset' : ''}</span></div>
          <div className="pg-canvas" ref={canvasContainerRef}>
            <GraphView key={scene} ref={graphRef} nodes={graph.nodes} links={graph.links} preset={preset} theme={themes[theme]} paused={paused}
              mode={root ? 'local' : 'global'} rootNodeId={root} localDepth={1} selectedNodeId={selected}
              cameraFocusNodeId={selected}
              ariaLabel="Interactive network. Drag nodes, pan the background, or use the node selector to explore."
              onNodeClick={node => setSelected(node.id)} onNodeDoubleClick={explore} onError={e => setError(e.message)} />
          </div>
          {error && <div role="alert" className="pg-error">The graph could not finish rendering. {error} <button onClick={() => window.location.reload()}>Reload</button></div>}
          <div className="pg-stage-footer">
            <span className="pg-gesture">Drag to move · Scroll to zoom · Double-click to explore</span>
            <div className="pg-toolbar" aria-label="Graph controls">
              {root && <button onClick={() => { setRoot(null); setSelected(null); }}>Show all</button>}
              <button onClick={() => setPaused(!paused)} aria-label={paused ? 'Resume motion' : 'Pause motion'} title={paused ? 'Resume motion' : 'Pause motion'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
              <button onClick={() => graphRef.current?.restartSimulation()} disabled={paused} aria-label="Replay motion" title="Replay motion"><RotateCcw size={16} /></button>
              <button onClick={() => graphRef.current?.fitToView()} aria-label="Fit graph to view" title="Fit graph to view"><Expand size={16} /></button>
            </div>
          </div>
        </section>

        <aside className="pg-controls" aria-label="Playground settings">
          <section className="pg-control-section">
            <div className="pg-section-title"><span>01</span><h2>Set the scene</h2></div>
            <label className="pg-label" htmlFor="pg-dataset">Sample graph</label>
            <select id="pg-dataset" value={scene} onChange={e => { setScene(e.target.value); setSelected(null); setRoot(null); setError(null); }}>
              <option value="notebook">Connected notebook · 53 nodes</option><option value="250">Small network · 250 nodes</option><option value="1000">Large network · 1,000 nodes</option>
            </select>
            <p className="pg-help">Fictional notes, real connections. Try a larger network to see how it scales.</p>
          </section>
          <section className="pg-control-section">
            <div className="pg-section-title"><span>02</span><h2>Find your rhythm</h2></div>
            <div className="pg-motions" role="group" aria-label="Motion preset">{motions.map(item => <button key={item.id} aria-pressed={motion === item.id} onClick={() => setMotion(item.id)}>{item.label}{motion === item.id && <span className="pg-active-dot" />}</button>)}</div>
            <p className="pg-help pg-motion-description" aria-live="polite">{motions.find(item => item.id === motion)?.description}</p>
            <div className="pg-themes" role="group" aria-label="Graph appearance">{Object.keys(themes).map(id => <button key={id} onClick={() => setTheme(id)} aria-pressed={theme === id}><span className={`pg-swatch pg-swatch-${id}`} />{id[0].toUpperCase() + id.slice(1)}</button>)}</div>
          </section>
          <section className="pg-control-section pg-explore">
            <div className="pg-section-title"><span>03</span><h2>Follow a connection</h2></div>
            <label className="pg-label" htmlFor="pg-node">Choose a node</label>
            <select id="pg-node" value={selected ?? ''} onChange={e => { setSelected(e.target.value || null); setRoot(null); }}>
              <option value="">Or click one in the graph</option>{graph.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}
            </select>
            <button className="pg-explore-button" disabled={!selectedNode} onClick={() => selectedNode && explore(selectedNode)}>Explore neighborhood <MoveUpRight size={15} /></button>
          </section>
        </aside>
      </div>

      <section className="pg-use" aria-labelledby="pg-use-title">
        <div className="pg-use-copy"><p className="pg-eyebrow">YOUR DATA. YOUR GRAPH.</p><h2 id="pg-use-title">A few lines. All connected.</h2><p>Bring nodes and links. Ograph handles the movement,<br className="pg-desktop-break" /> rendering, and exploration.</p><div className="pg-install"><code>npm install @eunjjang/ograph</code><CopyButton text="npm install @eunjjang/ograph" label="Copy install command" /></div></div>
        <div className="pg-code"><div><span>React · Current motion preset</span><CopyButton key={snippet} text={snippet} label="Copy React example" /></div><pre><code>{snippet}</code></pre></div>
      </section>
    </main>
    <footer className="pg-footer"><span>Built for the connections you haven't found yet.</span><span>Open source · MIT <a href={`${repo}/releases`} target="_blank" rel="noreferrer">Changelog <ArrowUpRight size={12} /></a></span></footer>
  </div>;
}
