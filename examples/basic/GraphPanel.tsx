import { GraphView, type GraphLink, type GraphNode } from '@afterglow/ograph';

const nodes: GraphNode[] = [
  { id: 'note-a', label: 'Note A', type: 'note' },
  { id: 'note-b', label: 'Note B', type: 'note' },
  { id: 'tag-react', label: '#react', type: 'tag' }
];

const links: GraphLink[] = [
  { source: 'note-a', target: 'note-b' },
  { source: 'note-a', target: 'tag-react' }
];

export function BasicGraphPanel() {
  return (
    <div style={{ width: 800, height: 600 }}>
      <GraphView
        ariaLabel="Example note graph"
        nodes={nodes}
        links={links}
        onNodeClick={(node) => {
          console.log(node.id);
        }}
      />
    </div>
  );
}
