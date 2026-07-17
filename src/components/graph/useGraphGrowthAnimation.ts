import { useEffect, useMemo, useState } from 'react';
import type {
  GraphGrowthAnimationOptions,
  GraphGrowthTimestamp,
  GraphLink,
  GraphNode,
  GraphNodeMetadata
} from './types';
import { getLinkId } from './localGraph';

export const DEFAULT_GRAPH_GROWTH_TIMESTAMP_METADATA_KEY = 'createdAt';
export const DEFAULT_GRAPH_GROWTH_STEP_MS = 140;

interface ResolvedGraphGrowthAnimationOptions<Metadata extends GraphNodeMetadata = GraphNodeMetadata> {
  enabled: boolean;
  getNodeTimestamp?: (node: GraphNode<Metadata>) => GraphGrowthTimestamp;
  timestampMetadataKey: string;
  stepMs: number;
  initialDelayMs: number;
}

interface GraphGrowthSequenceItem {
  id: string;
  timestamp: number | null;
  inputIndex: number;
}

export interface GraphGrowthSequence {
  items: GraphGrowthSequenceItem[];
  signature: string;
}

export interface GraphGrowthFrame<
  NodeMetadata extends GraphNodeMetadata = GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata = GraphNodeMetadata
> {
  nodes: GraphNode<NodeMetadata>[];
  links: GraphLink<LinkMetadata, NodeMetadata>[];
  revealedNodeIds: Set<string>;
  isComplete: boolean;
}

const EMPTY_GRAPH_GROWTH_SEQUENCE: GraphGrowthSequence = {
  items: [],
  signature: ''
};

function sanitizeMilliseconds(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function getInitialGraphGrowthRevealedCount(
  totalNodeCount: number,
  shouldAnimate: boolean,
  initialDelayMs: number
): number {
  if (!shouldAnimate) {
    return totalNodeCount;
  }

  return initialDelayMs > 0 ? 0 : Math.min(1, totalNodeCount);
}

export function resolveGraphGrowthAnimationOptions<Metadata extends GraphNodeMetadata>(
  animation: boolean | GraphGrowthAnimationOptions<Metadata> | undefined
): ResolvedGraphGrowthAnimationOptions<Metadata> {
  if (animation === undefined || animation === false) {
    return {
      enabled: false,
      timestampMetadataKey: DEFAULT_GRAPH_GROWTH_TIMESTAMP_METADATA_KEY,
      stepMs: DEFAULT_GRAPH_GROWTH_STEP_MS,
      initialDelayMs: 0
    };
  }

  if (animation === true) {
    return {
      enabled: true,
      timestampMetadataKey: DEFAULT_GRAPH_GROWTH_TIMESTAMP_METADATA_KEY,
      stepMs: DEFAULT_GRAPH_GROWTH_STEP_MS,
      initialDelayMs: 0
    };
  }

  return {
    enabled: animation.enabled !== false,
    getNodeTimestamp: animation.getNodeTimestamp,
    timestampMetadataKey: animation.timestampMetadataKey || DEFAULT_GRAPH_GROWTH_TIMESTAMP_METADATA_KEY,
    stepMs: sanitizeMilliseconds(animation.stepMs, DEFAULT_GRAPH_GROWTH_STEP_MS),
    initialDelayMs: sanitizeMilliseconds(animation.initialDelayMs, 0)
  };
}

export function parseGraphGrowthTimestamp(value: GraphGrowthTimestamp): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  return null;
}

export function resolveNodeGrowthTimestamp<Metadata extends GraphNodeMetadata>(
  node: GraphNode<Metadata>,
  options: Pick<
    ResolvedGraphGrowthAnimationOptions<Metadata>,
    'getNodeTimestamp' | 'timestampMetadataKey'
  >
): number | null {
  const value = options.getNodeTimestamp
    ? options.getNodeTimestamp(node)
    : node.metadata?.[options.timestampMetadataKey];

  return parseGraphGrowthTimestamp(value as GraphGrowthTimestamp);
}

export function buildGraphGrowthSequence<Metadata extends GraphNodeMetadata>(
  nodes: GraphNode<Metadata>[],
  options: Pick<
    ResolvedGraphGrowthAnimationOptions<Metadata>,
    'getNodeTimestamp' | 'timestampMetadataKey'
  >
): GraphGrowthSequence {
  const items = nodes.map((node, inputIndex) => ({
    id: node.id,
    timestamp: resolveNodeGrowthTimestamp(node, options),
    inputIndex
  }));

  items.sort((left, right) => {
    const leftTimestamp = left.timestamp ?? Infinity;
    const rightTimestamp = right.timestamp ?? Infinity;

    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }

    return left.inputIndex - right.inputIndex;
  });

  return {
    items,
    signature: items
      .map(item => `${item.id}\u0000${item.timestamp ?? 'undated'}\u0000${item.inputIndex}`)
      .join('\u0001')
  };
}

export function filterGraphByGrowthStep<
  NodeMetadata extends GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata
>(
  nodes: GraphNode<NodeMetadata>[],
  links: GraphLink<LinkMetadata, NodeMetadata>[],
  sequence: GraphGrowthSequence,
  revealedCount: number
): GraphGrowthFrame<NodeMetadata, LinkMetadata> {
  const clampedCount = Math.max(0, Math.min(sequence.items.length, Math.floor(revealedCount)));
  const revealedNodeIds = new Set(sequence.items.slice(0, clampedCount).map(item => item.id));

  if (clampedCount >= sequence.items.length) {
    return {
      nodes,
      links,
      revealedNodeIds,
      isComplete: true
    };
  }

  return {
    nodes: nodes.filter(node => revealedNodeIds.has(node.id)),
    links: links.filter(link => {
      const sourceId = getLinkId(link.source);
      const targetId = getLinkId(link.target);

      return (
        sourceId !== targetId &&
        revealedNodeIds.has(sourceId) &&
        revealedNodeIds.has(targetId)
      );
    }),
    revealedNodeIds,
    isComplete: false
  };
}

export function createCompleteGraphGrowthFrame<
  NodeMetadata extends GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata
>(
  nodes: GraphNode<NodeMetadata>[],
  links: GraphLink<LinkMetadata, NodeMetadata>[]
): GraphGrowthFrame<NodeMetadata, LinkMetadata> {
  return {
    nodes,
    links,
    revealedNodeIds: new Set(nodes.map(node => node.id)),
    isComplete: true
  };
}

export function useGraphGrowthAnimation<
  NodeMetadata extends GraphNodeMetadata,
  LinkMetadata extends GraphNodeMetadata
>({
  nodes,
  links,
  animation,
  reduceMotion
}: {
  nodes: GraphNode<NodeMetadata>[];
  links: GraphLink<LinkMetadata, NodeMetadata>[];
  animation: boolean | GraphGrowthAnimationOptions<NodeMetadata> | undefined;
  reduceMotion: boolean;
}): GraphGrowthFrame<NodeMetadata, LinkMetadata> {
  const options = resolveGraphGrowthAnimationOptions(animation);
  const sequence = useMemo(
    () => options.enabled
      ? buildGraphGrowthSequence(nodes, options)
      : EMPTY_GRAPH_GROWTH_SEQUENCE,
    [nodes, options.enabled, options.getNodeTimestamp, options.timestampMetadataKey]
  );
  const totalNodeCount = options.enabled ? sequence.items.length : nodes.length;
  const shouldAnimate = options.enabled && !reduceMotion && totalNodeCount > 0;
  const [revealedCount, setRevealedCount] = useState(() => (
    getInitialGraphGrowthRevealedCount(totalNodeCount, shouldAnimate, options.initialDelayMs)
  ));

  useEffect(() => {
    if (!shouldAnimate) {
      setRevealedCount(totalNodeCount);
      return;
    }

    if (options.stepMs === 0) {
      setRevealedCount(totalNodeCount);
      return;
    }

    let cancelled = false;
    let nextCount = getInitialGraphGrowthRevealedCount(
      totalNodeCount,
      shouldAnimate,
      options.initialDelayMs
    );
    let timeoutId: number | null = null;

    setRevealedCount(nextCount);

    const scheduleNextReveal = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;

        nextCount = Math.min(totalNodeCount, nextCount + 1);
        setRevealedCount(nextCount);

        if (nextCount < totalNodeCount) {
          scheduleNextReveal(options.stepMs);
        }
      }, delayMs);
    };

    if (nextCount < totalNodeCount) {
      scheduleNextReveal(nextCount === 0 ? options.initialDelayMs : options.stepMs);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    options.initialDelayMs,
    options.stepMs,
    sequence.signature,
    shouldAnimate,
    totalNodeCount
  ]);

  return useMemo(
    () => options.enabled
      ? filterGraphByGrowthStep(
          nodes,
          links,
          sequence,
          shouldAnimate ? revealedCount : totalNodeCount
        )
      : createCompleteGraphGrowthFrame(nodes, links),
    [
      links,
      nodes,
      options.enabled,
      revealedCount,
      sequence,
      shouldAnimate,
      totalNodeCount
    ]
  );
}
