import type { GraphLink, GraphNode } from '../components/graph';

const chapters = [
  ['Design', 'Visual rhythm', 'Typography', 'Color studies', 'Small details', 'Spatial thinking', 'Creative constraints', 'Design systems', 'Accessibility', 'Good interfaces', 'Field notes', 'Sketchbook', 'Negative space'],
  ['Engineering', 'React', 'TypeScript', 'Graph theory', 'Force simulation', 'Web workers', 'Rendering', 'Performance', 'Data structures', 'Useful abstractions', 'Experiments', 'Open source', 'Testing'],
  ['Learning', 'Reading list', 'Mental models', 'Slow thinking', 'Asking questions', 'Making connections', 'Daily practice', 'Research notes', 'Curiosity', 'First principles', 'Reflection', 'Shared knowledge', 'New ideas'],
  ['Everyday', 'Morning walks', 'Places to visit', 'Music collection', 'Weekend projects', 'Analog tools', 'Coffee notes', 'Photography', 'Small rituals', 'Seasonal cooking', 'Things to make', 'Conversations', 'Serendipity']
];

/** A public, fictional notebook with reproducible topology and starting positions. */
export function createNotebookGraph(): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [{ id: 'home', label: 'A connected notebook', type: 'hub', size: 1.5, x: 0, y: 0 }];
  const links: GraphLink[] = [];
  chapters.forEach((words, group) => {
    const angle = group * Math.PI / 2 - Math.PI / 4;
    const cx = Math.cos(angle) * 200, cy = Math.sin(angle) * 200;
    words.forEach((label, index) => {
      const id = `${group}-${index}`;
      const a = index * Math.PI * 2 / (words.length - 1);
      nodes.push({ id, label, group: words[0], type: index === 0 ? 'hub' : group === 1 ? 'tag' : group === 3 ? 'attachment' : 'note',
        size: index === 0 ? 1.2 : 0.85, x: cx + (index ? Math.cos(a) * 90 : 0), y: cy + (index ? Math.sin(a) * 90 : 0) });
      links.push({ source: index === 0 ? 'home' : `${group}-0`, target: id });
      if (index > 1) links.push({ source: `${group}-${index - 1}`, target: id });
    });
  });
  for (const [source, target] of [['0-7', '1-9'], ['1-3', '2-5'], ['2-12', '3-4'], ['3-7', '0-3'], ['0-8', '1-12'], ['2-7', '0-10']]) links.push({ source, target });
  return { nodes, links };
}
