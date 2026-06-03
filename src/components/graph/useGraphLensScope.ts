import { useEffect, useMemo, useState } from 'react';
import type { GraphLink, GraphNode, GraphViewMode } from './types';
import {
  buildLocalGraphScope,
  mergeGraphScopes,
  type GraphSubset
} from './localGraph';

export const LENS_TRANSITION_MS = 360;
export const LOCAL_PHYSICS_HALO_DEPTH = 1;

interface UseGraphLensScopeParams {
  nodes: GraphNode[];
  links: GraphLink[];
  mode: GraphViewMode;
  rootNodeId: string | null | undefined;
  localDepth: number;
  reduceMotion: boolean;
}

export function useGraphLensScope({
  nodes,
  links,
  mode,
  rootNodeId,
  localDepth,
  reduceMotion
}: UseGraphLensScopeParams) {
  const targetScope = useMemo(() => {
    if (mode === 'local' && rootNodeId) {
      return buildLocalGraphScope(
        nodes,
        links,
        rootNodeId,
        localDepth,
        LOCAL_PHYSICS_HALO_DEPTH
      );
    }

    const allNodeIds = new Set(nodes.map(node => node.id));
    const graph = { nodes, links };
    return {
      visibleGraph: graph,
      physicsGraph: graph,
      visibleNodeIds: allNodeIds,
      physicsNodeIds: allNodeIds
    };
  }, [links, localDepth, mode, nodes, rootNodeId]);

  const [renderGraph, setRenderGraph] = useState<GraphSubset>(targetScope.physicsGraph);

  useEffect(() => {
    setRenderGraph(current => mergeGraphScopes(
      nodes,
      links,
      new Set(current.nodes.map(node => node.id)),
      targetScope.physicsNodeIds
    ));

    const settleTimer = window.setTimeout(() => {
      setRenderGraph(targetScope.physicsGraph);
    }, reduceMotion ? 0 : LENS_TRANSITION_MS);

    return () => {
      window.clearTimeout(settleTimer);
    };
  }, [links, nodes, reduceMotion, targetScope]);

  return {
    simulationGraph: targetScope.physicsGraph,
    renderGraph,
    visibleGraph: targetScope.visibleGraph,
    visibleNodeIds: targetScope.visibleNodeIds,
    physicsNodeIds: targetScope.physicsNodeIds
  };
}
