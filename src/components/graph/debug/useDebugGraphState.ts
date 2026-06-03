import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphNode } from '../types';
import { buildLocalGraphScope } from '../localGraph';
import { generateMockGraphData } from './generateMockGraphData';

export type DebugGraphMode = 'global' | 'local';

export interface DebugGraphInteractionState {
  mode: DebugGraphMode;
  selectedNodeId: string | null;
  rootNodeId: string | null;
}

export function applyDebugModeChange(
  state: DebugGraphInteractionState,
  mode: DebugGraphMode
): DebugGraphInteractionState {
  return {
    ...state,
    mode,
    selectedNodeId: mode === 'global' ? null : state.selectedNodeId
  };
}

export function applyDebugRootFocus(
  state: DebugGraphInteractionState,
  rootNodeId: string | null
): DebugGraphInteractionState {
  return {
    ...state,
    rootNodeId,
    selectedNodeId: null
  };
}

export function useDebugGraphState() {
  const [nodeCount, setNodeCount] = useState<number>(1000);
  const [avgLinks, setAvgLinks] = useState<number>(3.5);
  const [seed, setSeed] = useState<number>(42);
  const [localDepth, setLocalDepth] = useState<number>(2);
  const [interactionState, setInteractionState] = useState<DebugGraphInteractionState>({
    mode: 'global',
    selectedNodeId: null,
    rootNodeId: null
  });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const { mode, selectedNodeId, rootNodeId } = interactionState;

  const { originalNodes, originalLinks } = useMemo(() => {
    const data = generateMockGraphData(nodeCount, avgLinks, seed);
    return { originalNodes: data.nodes, originalLinks: data.links };
  }, [nodeCount, avgLinks, seed]);

  const derivedNodeLists = useMemo(() => {
    const hubNodes: GraphNode[] = [];
    const rootSelectorOptions: GraphNode[] = [];

    for (const node of originalNodes) {
      if (node.type === 'hub') {
        hubNodes.push(node);
        rootSelectorOptions.push(node);
      } else if ((node.degree ?? 0) >= 5) {
        rootSelectorOptions.push(node);
      }
    }

    return { hubNodes, rootSelectorOptions };
  }, [originalNodes]);

  const { hubNodes, rootSelectorOptions } = derivedNodeLists;

  useEffect(() => {
    const defaultHub = hubNodes[0] || originalNodes[0];
    if (defaultHub) {
      setInteractionState((current) => applyDebugRootFocus(current, defaultHub.id));
    }
  }, [hubNodes, originalNodes]);

  const filteredElements = useMemo(() => {
    if (mode === 'local' && rootNodeId) {
      const localScope = buildLocalGraphScope(originalNodes, originalLinks, rootNodeId, localDepth);
      return {
        visibleNodes: localScope.visibleGraph.nodes.length,
        visibleLinks: localScope.visibleGraph.links.length,
        simulatedNodes: localScope.physicsGraph.nodes.length,
        simulatedLinks: localScope.physicsGraph.links.length
      };
    }
    return {
      visibleNodes: originalNodes.length,
      visibleLinks: originalLinks.length,
      simulatedNodes: originalNodes.length,
      simulatedLinks: originalLinks.length
    };
  }, [originalNodes, originalLinks, mode, rootNodeId, localDepth]);

  const randomizeSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1000));
  }, []);

  const setMode = useCallback((nextMode: DebugGraphMode) => {
    setInteractionState((current) => applyDebugModeChange(current, nextMode));
  }, []);

  const setSelectedNodeId = useCallback((nextSelectedNodeId: string | null) => {
    setInteractionState((current) => ({
      ...current,
      selectedNodeId: nextSelectedNodeId
    }));
  }, []);

  const setRootNodeId = useCallback((nextRootNodeId: string | null) => {
    setInteractionState((current) => applyDebugRootFocus(current, nextRootNodeId));
  }, []);

  const randomizeHub = useCallback(() => {
    if (hubNodes.length === 0) return;
    const match = hubNodes[Math.floor(Math.random() * hubNodes.length)]!;
    setRootNodeId(match.id);
  }, [hubNodes, setRootNodeId]);

  return {
    nodeCount,
    setNodeCount,
    avgLinks,
    setAvgLinks,
    seed,
    mode,
    setMode,
    localDepth,
    setLocalDepth,
    selectedNodeId,
    setSelectedNodeId,
    rootNodeId,
    setRootNodeId,
    hoveredNodeId,
    setHoveredNodeId,
    originalNodes,
    originalLinks,
    rootSelectorOptions,
    filteredElements,
    randomizeSeed,
    randomizeHub
  };
}
