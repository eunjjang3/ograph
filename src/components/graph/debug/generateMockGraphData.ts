import type { GraphNode, GraphLink, GraphNodeType } from '../types';
import { getLinkId } from '../localGraph';

/**
 * Seeded Mulberry32 Pseudo-Random Number Generator.
 * Guarantees that the stress-test mock graphs are completely deterministic.
 */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    let t = (state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates deterministic notes graph structures with community clustering,
 * variable degrees, hubs, attachments, tags, and unresolved links.
 */
export function generateMockGraphData(
  nodeCount: number,
  avgLinksPerNode: number,
  seed = 42
): { nodes: GraphNode[]; links: GraphLink[] } {
  const rand = createRandom(seed);
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const hubs: GraphNode[] = [];
  const tags: GraphNode[] = [];
  const groupBuckets = new Map<string, GraphNode[]>();

  // Determine community attributes based on target graph size
  const numCommunities = Math.max(3, Math.floor(Math.sqrt(nodeCount / 4)));
  
  // 1. Generate community centers/positions to initialize nodes smoothly
  const communityCenters = Array.from({ length: numCommunities }, (_, idx) => {
    const angle = (idx / numCommunities) * 2 * Math.PI;
    const distanceCenter = 120 + rand() * 180;
    return {
      id: `comm-center-${idx}`,
      x: Math.cos(angle) * distanceCenter,
      y: Math.sin(angle) * distanceCenter
    };
  });

  // Descriptive lists to formulate note titles
  const subjects = [
    'Linked Note', 'TypeScript', 'Next.js', 'React', 'Tailwind', 'Database', 'Simulation', 'Graph', 
    'Vector', 'Zustand', 'D3Force', 'Canvas', 'Performance', 'Index', 'Project', 'Log', 'Brain',
    'Structure', 'Flow', 'Algorithm', 'System', 'Data', 'Interface', 'Concept', 'Idea', 'Meeting'
  ];
  const modifiers = [
    'MOC', 'Draft', 'Review', 'Guide', 'Arch', 'Sprint', 'Engine', 'Module', 'Harness', 'Core',
    'Settings', 'Diagnostics', 'Setup', 'Snippet', 'Reference', 'CheatSheet', 'Schema', 'Spec'
  ];
  const tagWords = ['tech', 'personal', 'code', 'inbox', 'archive', 'learning', 'work', 'health', 'finance'];

  // Helper arrays for types selection
  // Distribution: ~70% note, ~10% tag, ~8% attachment, ~8% unresolved, ~4% hub
  const nodeTypes: { type: GraphNodeType; weight: number }[] = [
    { type: 'note', weight: 0.70 },
    { type: 'tag', weight: 0.10 },
    { type: 'attachment', weight: 0.08 },
    { type: 'unresolved', weight: 0.08 },
    { type: 'hub', weight: 0.04 }
  ];

  const getWeightedType = (): GraphNodeType => {
    const r = rand();
    let cumulative = 0;
    for (const item of nodeTypes) {
      cumulative += item.weight;
      if (r <= cumulative) return item.type;
    }
    return 'note';
  };

  // 2. Build Nodes List
  for (let i = 0; i < nodeCount; i++) {
    const type = getWeightedType();
    const commIdx = Math.floor(rand() * numCommunities);
    const comm = communityCenters[commIdx]!;

    let label = '';
    let size = 1.0;

    // Apply structured label vocabulary
    if (type === 'hub') {
      const sub = subjects[Math.floor(rand() * subjects.length)];
      label = ` MOC::${sub} `;
      size = 1.8 + rand() * 0.7; // large index hub
    } else if (type === 'tag') {
      const idx = Math.floor(rand() * tagWords.length);
      label = `#${tagWords[idx]}-${Math.floor(rand() * 10)}`;
      size = 0.9 + rand() * 0.3;
    } else if (type === 'attachment') {
      const sub = subjects[Math.floor(rand() * subjects.length)].toLowerCase();
      const ext = rand() > 0.5 ? 'png' : 'pdf';
      label = `attachment_${sub}_img.${ext}`;
      size = 0.8;
    } else if (type === 'unresolved') {
      label = `Undefined Link::${Math.floor(rand() * 9000 + 1000)}`;
      size = 0.85;
    } else {
      // standard note
      const sub = subjects[Math.floor(rand() * subjects.length)];
      const mod = modifiers[Math.floor(rand() * modifiers.length)];
      label = `${sub} ${mod}`;
      size = 1.0 + rand() * 0.4;
    }

    const id = `node-${i}`;

    // Seed loose spatial coordinates around their assigned community center
    // This allows physics forces to organize with minimal collisions, maximizing frame rates on heavy loads
    const radiusOffset = 20 + rand() * 60;
    const personalAngle = rand() * 2 * Math.PI;

    const graphNode: GraphNode = {
      id,
      label,
      type,
      group: `group-${commIdx}`,
      size,
      x: comm.x + Math.cos(personalAngle) * radiusOffset,
      y: comm.y + Math.sin(personalAngle) * radiusOffset
    };

    nodes.push(graphNode);

    if (type === 'hub') {
      hubs.push(graphNode);
    } else if (type === 'tag') {
      tags.push(graphNode);
    }

    const bucketKey = graphNode.group || '';
    const bucket = groupBuckets.get(bucketKey);
    if (bucket) {
      bucket.push(graphNode);
    } else {
      groupBuckets.set(bucketKey, [graphNode]);
    }
  }

  // 3. Build Realistic Links List
  // To reach 'avgLinksPerNode' average degree: TotalLinks = N * avgLinksPerNode / 2
  const targetLinkCount = Math.floor((nodeCount * avgLinksPerNode) / 2);

  const existingLinkKeys = new Set<string>();
  const addLink = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return false;
    const key = sourceId < targetId ? `${sourceId}_${targetId}` : `${targetId}_${sourceId}`;
    if (existingLinkKeys.has(key)) return false;

    existingLinkKeys.add(key);
    links.push({
      source: sourceId,
      target: targetId,
      weight: 1.0
    });
    return true;
  };

  // Connect communities to global hubs first
  if (hubs.length > 0) {
    nodes.forEach(node => {
      if (node.type !== 'hub' && rand() < 0.12) {
        const targetHub = hubs[Math.floor(rand() * hubs.length)]!;
        addLink(node.id, targetHub.id);
      }
    });
  }

  // Connect communities to global tags
  if (tags.length > 0) {
    nodes.forEach(node => {
      if (node.type !== 'tag' && rand() < 0.08) {
        const targetTag = tags[Math.floor(rand() * tags.length)]!;
        addLink(node.id, targetTag.id);
      }
    });
  }

  // Clustered connecting loop: preferential attachment to same group
  let attempts = 0;
  while (links.length < targetLinkCount && attempts < targetLinkCount * 5) {
    attempts++;
    const nodeA = nodes[Math.floor(rand() * nodes.length)]!;
    
    // Attachments only receive incoming links, so they're secondary
    if (nodeA.type === 'attachment') continue;

    // Pick a candidate B
    let nodeB: GraphNode;
    
    // 75% Community-internal linkage, 25% global bridge connections
    if (rand() < 0.75) {
      // Find candidate in same group
      const peerGroup = groupBuckets.get(nodeA.group || '') || [];
      if (peerGroup.length > 0) {
        let peerIndex = Math.floor(rand() * peerGroup.length);
        nodeB = peerGroup[peerIndex]!;
        if (nodeB.id === nodeA.id && peerGroup.length > 1) {
          peerIndex = (peerIndex + 1) % peerGroup.length;
          nodeB = peerGroup[peerIndex]!;
        }
      } else {
        nodeB = nodes[Math.floor(rand() * nodes.length)]!;
      }
    } else {
      nodeB = nodes[Math.floor(rand() * nodes.length)]!;
    }

    addLink(nodeA.id, nodeB.id);
  }

  // Compute node degrees on final result.
  const degrees = new Map<string, number>();
  links.forEach(l => {
    const s = getLinkId(l.source);
    const t = getLinkId(l.target);
    degrees.set(s, (degrees.get(s) || 0) + 1);
    degrees.set(t, (degrees.get(t) || 0) + 1);
  });

  nodes.forEach(n => {
    n.degree = degrees.get(n.id) || 0;
  });

  return { nodes, links };
}
