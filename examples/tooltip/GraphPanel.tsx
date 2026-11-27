import { GraphView, type GraphNode, type GraphTooltipOptions } from '@eunjjang/ograph';

type NoteMetadata = { summary: string };
const nodes: GraphNode<NoteMetadata>[] = [
  { id: 'note', label: 'A note', metadata: { summary: 'Details supplied by the host app.' } }
];
const links: [] = [];

const styledTooltip: GraphTooltipOptions<NoteMetadata> = {
  style: {
    backgroundColor: '#fff7ed', color: '#7c2d12', border: '1px solid #fb923c',
    borderRadius: 16, padding: '10px 16px', left: 'auto', right: 16
  },
  dotStyle: { backgroundColor: '#ea580c', borderRadius: 2 },
  labelStyle: { fontWeight: 600 },
  typeStyle: { display: 'none' }
};

const customTooltip: GraphTooltipOptions<NoteMetadata> = {
  render: node => (
    <article style={{ background: '#0f172a', color: '#a5f3fc', padding: 16, borderRadius: 20 }}>
      <strong>{node.label}</strong>
      <p>{node.metadata?.summary}</p>
    </article>
  )
};

export function GraphPanel({ tooltip = 'styled' }: { tooltip?: 'styled' | 'hidden' | 'custom' }) {
  return (
    <div style={{ height: 400 }}>
      <GraphView
        nodes={nodes}
        links={links}
        tooltip={tooltip === 'hidden' ? false : tooltip === 'custom' ? customTooltip : styledTooltip}
      />
    </div>
  );
}
