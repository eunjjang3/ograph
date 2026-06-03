import type { GraphLink, GraphNode, GraphNodeMetadata } from './types';

const MIN_LOCAL_DEPTH = 1;
const MAX_LOCAL_DEPTH = 10;
const FINITE_NODE_NUMBER_KEYS = ['x', 'y', 'vx', 'vy'] as const;
const NULLABLE_NODE_NUMBER_KEYS = ['fx', 'fy'] as const;

type FiniteNodeNumberKey = typeof FINITE_NODE_NUMBER_KEYS[number];
type NullableNodeNumberKey = typeof NULLABLE_NODE_NUMBER_KEYS[number];

export interface NormalizedGraphInput<
  NodeMetadata extends GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata
> {
  nodes: GraphNode<NodeMetadata>[];
  nodeIds: ReadonlySet<string>;
  links: GraphLink<LinkMetadata, NodeMetadata>[];
  localDepth: number;
}

function isDevelopmentRuntime(): boolean {
  const importMetaEnv = (import.meta as ImportMeta & {
    env?: { DEV?: boolean; MODE?: string };
  }).env;

  if (importMetaEnv) {
    return importMetaEnv.DEV === true || importMetaEnv.MODE === 'development';
  }

  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

function warnDuplicateNodeId(nodeId: string): void {
  if (!isDevelopmentRuntime() || typeof console === 'undefined') {
    return;
  }

  console.warn(`[ograph] Duplicate node id "${nodeId}" was ignored. The first node with this id is used.`);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getEndpointId(endpoint: unknown): string | null {
  if (typeof endpoint === 'string') {
    return endpoint;
  }

  if (isObjectRecord(endpoint) && typeof endpoint.id === 'string') {
    return endpoint.id;
  }

  return null;
}

function cloneNodeForNormalization<Metadata extends GraphNodeMetadata>(
  node: GraphNode<Metadata>,
  label: string
): GraphNode<Metadata> {
  return { ...node, label } as GraphNode<Metadata>;
}

function normalizeNodeNumber<
  Metadata extends GraphNodeMetadata,
  Key extends FiniteNodeNumberKey | NullableNodeNumberKey
>(
  normalizedNode: GraphNode<Metadata> | null,
  sourceNode: GraphNode<Metadata>,
  label: string,
  key: Key,
  allowNull: boolean
): GraphNode<Metadata> | null {
  const value = sourceNode[key];

  if (value === undefined || (allowNull && value === null)) {
    return normalizedNode;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizedNode;
  }

  const nextNode = normalizedNode ?? cloneNodeForNormalization(sourceNode, label);
  delete nextNode[key];
  return nextNode;
}

function normalizeNode<Metadata extends GraphNodeMetadata>(
  node: GraphNode<Metadata>
): GraphNode<Metadata> {
  const label = typeof node.label === 'string' ? node.label : String(node.id);
  let normalizedNode = label === node.label ? null : cloneNodeForNormalization(node, label);

  for (const key of FINITE_NODE_NUMBER_KEYS) {
    normalizedNode = normalizeNodeNumber(normalizedNode, node, label, key, false);
  }

  for (const key of NULLABLE_NODE_NUMBER_KEYS) {
    normalizedNode = normalizeNodeNumber(normalizedNode, node, label, key, true);
  }

  return normalizedNode ?? node;
}

export function sanitizeNodes<Metadata extends GraphNodeMetadata>(
  nodes: GraphNode<Metadata>[]
): GraphNode<Metadata>[] {
  if (!Array.isArray(nodes)) {
    return [];
  }

  const seenNodeIds = new Set<string>();
  const sanitizedNodes: GraphNode<Metadata>[] = [];

  for (const node of nodes) {
    if (!isObjectRecord(node) || typeof node.id !== 'string' || node.id === '') {
      continue;
    }

    if (seenNodeIds.has(node.id)) {
      warnDuplicateNodeId(node.id);
      continue;
    }

    seenNodeIds.add(node.id);
    sanitizedNodes.push(normalizeNode(node as GraphNode<Metadata>));
  }

  return sanitizedNodes;
}

export function sanitizeLinks<
  LinkMetadata extends GraphNodeMetadata,
  NodeMetadata extends GraphNodeMetadata
>(
  links: GraphLink<LinkMetadata, NodeMetadata>[],
  nodeIds: ReadonlySet<string>
): GraphLink<LinkMetadata, NodeMetadata>[] {
  if (!Array.isArray(links)) {
    return [];
  }

  return links.filter(link => {
    if (!isObjectRecord(link)) {
      return false;
    }

    const sourceId = getEndpointId(link.source);
    const targetId = getEndpointId(link.target);

    return (
      sourceId !== null &&
      targetId !== null &&
      sourceId !== targetId &&
      nodeIds.has(sourceId) &&
      nodeIds.has(targetId)
    );
  });
}

export function sanitizeLocalDepth(depth: unknown): number {
  const numericDepth = typeof depth === 'number' ? depth : Number(depth);

  if (!Number.isFinite(numericDepth)) {
    return MIN_LOCAL_DEPTH;
  }

  const integerDepth = Math.floor(numericDepth);
  return Math.min(MAX_LOCAL_DEPTH, Math.max(MIN_LOCAL_DEPTH, integerDepth));
}

export function normalizeGraphInput<
  NodeMetadata extends GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata
>(
  input: {
    nodes: GraphNode<NodeMetadata>[];
    links: GraphLink<LinkMetadata, NodeMetadata>[];
    localDepth: unknown;
  }
): NormalizedGraphInput<NodeMetadata, LinkMetadata> {
  const nodes = sanitizeNodes(input.nodes);
  const nodeIds = new Set(nodes.map(node => node.id));
  const links = sanitizeLinks(input.links, nodeIds);
  const localDepth = sanitizeLocalDepth(input.localDepth);

  return { nodes, nodeIds, links, localDepth };
}
