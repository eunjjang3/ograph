import { withFixedSimulationClock } from './fixedSimulationClock';
import { applyPhysicsForces, createConfiguredCollision, resolvePhysicsTiming } from './graphPhysics';
import { resolveGraphPhysicsPreset } from './presets';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  forceSimulation,
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum
} from 'd3-force';
import type { GraphNode, GraphLink, GraphPreset, GraphViewMode } from './types';
import { getLinkId } from './localGraph';
import { buildGraphIndexes } from './graphIndexes';
import type { GraphRuntimeTelemetryRef, GraphSimulationMode } from './graphRuntime';
import type { WorkerSimulationConfig } from './graphSimulationProtocol';
import type { WorkerGraphSimulationClient } from './workerGraphSimulationClient';

declare const __OGRAPH_DEBUG_RUNTIME__: boolean;

interface ExtendedSimulationNode extends SimulationNodeDatum, GraphNode { dragX?: number; dragY?: number }
interface ExtendedSimulationLink extends SimulationLinkDatum<ExtendedSimulationNode> {
  source: string | ExtendedSimulationNode;
  target: string | ExtendedSimulationNode;
  weight?: number;
  type?: string;
  label?: string;
}

const DEFAULT_GRAPH_REFRESH_ALPHA = 0.22;
const DEFAULT_GRAVITY_CENTER = { x: 0, y: 0 };
const DEFAULT_VELOCITY_DECAY = 0.4;
const MIN_VELOCITY_DECAY = 0;
const MAX_VELOCITY_DECAY = 1;
const DEFAULT_ALPHA_MIN = 0.001;
const LOCAL_LENS_ALPHA_MIN = 0.005;
const DEFAULT_ALPHA_DECAY = 1 - Math.pow(DEFAULT_ALPHA_MIN, 1 / 300);
const LOCAL_LENS_ALPHA_DECAY = 0.08;
const MIN_ALPHA_DECAY = 0;
const MAX_ALPHA_DECAY = 1;

export interface SimulationGravityCenter {
  x: number;
  y: number;
}

export interface GraphDragPhysicsOptions {
  startAlphaTarget: number;
  moveAlphaTarget: number;
  wakeConnectedNodes: false;
}

export interface GraphCoolingOptions {
  alphaDecay: number;
  alphaMin: number;
}

export const DEFAULT_GRAPH_DRAG_PHYSICS: GraphDragPhysicsOptions = {
  startAlphaTarget: 0,
  moveAlphaTarget: 0.3,
  wakeConnectedNodes: false
};

export const LOCAL_LENS_DRAG_PHYSICS: GraphDragPhysicsOptions = {
  startAlphaTarget: 0,
  moveAlphaTarget: 0.05,
  wakeConnectedNodes: false
};

export interface GraphSimulationOptions {
  graphRefreshAlpha?: number;
  coolingMode?: GraphViewMode;
  preserveScopeCentroid?: boolean;
  gravityCenterNodeIds?: ReadonlySet<string>;
  dragPhysics?: Partial<GraphDragPhysicsOptions>;
  paused?: boolean;
  engine?: GraphSimulationMode;
  runtimeTelemetryRef?: GraphRuntimeTelemetryRef;
  createSimulationWorker?: () => Worker;
  onEngineUnavailable?: (engine: GraphSimulationMode, error: Error) => boolean;
  onError?: (error: Error) => void;
}

export interface GraphSimulationActivity {
  isActive: () => boolean;
  stop: () => void;
}

function toGraphError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}

export function getGraphDragPhysicsForMode(mode: GraphViewMode): GraphDragPhysicsOptions {
  return mode === 'local' ? LOCAL_LENS_DRAG_PHYSICS : DEFAULT_GRAPH_DRAG_PHYSICS;
}

export function resolveVelocityDecay(velocityDecay?: number): number {
  if (velocityDecay === undefined || !Number.isFinite(velocityDecay)) {
    return DEFAULT_VELOCITY_DECAY;
  }

  return Math.max(MIN_VELOCITY_DECAY, Math.min(MAX_VELOCITY_DECAY, velocityDecay));
}

export function resolveGraphCoolingOptions(
  mode: GraphViewMode,
  alphaDecay?: number
): GraphCoolingOptions {
  const defaultAlphaDecay = mode === 'local' ? LOCAL_LENS_ALPHA_DECAY : DEFAULT_ALPHA_DECAY;
  const resolvedAlphaDecay = alphaDecay === undefined || !Number.isFinite(alphaDecay) || alphaDecay <= MIN_ALPHA_DECAY
    ? defaultAlphaDecay
    : Math.min(MAX_ALPHA_DECAY, alphaDecay);

  return {
    alphaDecay: resolvedAlphaDecay,
    alphaMin: mode === 'local' ? LOCAL_LENS_ALPHA_MIN : DEFAULT_ALPHA_MIN
  };
}

export function resolveSimulationGravityCenter(
  nodes: Array<Pick<GraphNode, 'x' | 'y'>>,
  preserveScopeCentroid: boolean
): SimulationGravityCenter {
  if (!preserveScopeCentroid) {
    return DEFAULT_GRAVITY_CENTER;
  }

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    sumX += x;
    sumY += y;
    count += 1;
  }

  if (count === 0) {
    return DEFAULT_GRAVITY_CENTER;
  }

  return {
    x: sumX / count,
    y: sumY / count
  };
}

function compareStringValues(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function getSortedNodeIdSetSignature(nodeIds: ReadonlySet<string> | undefined): string {
  if (!nodeIds) {
    return '';
  }

  return JSON.stringify([...nodeIds].sort(compareStringValues));
}

export function getGraphTopologySignature(nodes: GraphNode[], links: GraphLink[]): string {
  const nodeIds = nodes.map(node => node.id).sort(compareStringValues);
  const nodeIdSet = new Set(nodeIds);
  const normalizedLinks: [string, string][] = [];

  for (const link of links) {
    const sourceId = getLinkId(link.source);
    const targetId = getLinkId(link.target);

    if (sourceId === targetId || !nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) {
      continue;
    }

    normalizedLinks.push(
      compareStringValues(sourceId, targetId) <= 0
        ? [sourceId, targetId]
        : [targetId, sourceId]
    );
  }

  normalizedLinks.sort((left, right) => (
    compareStringValues(left[0], right[0]) || compareStringValues(left[1], right[1])
  ));

  return JSON.stringify([nodeIds, normalizedLinks]);
}

function syncSimulationNodePayload(
  target: ExtendedSimulationNode,
  source: GraphNode,
  degree: number
): boolean {
  const previousSize = target.size;

  target.label = source.label;
  target.type = source.type;
  target.group = source.group;
  target.size = source.size;
  target.metadata = source.metadata;
  target.degree = degree;

  return !Object.is(previousSize, target.size);
}

export function useGraphSimulation(
  simulationNodes: GraphNode[],
  simulationLinks: GraphLink[],
  renderNodes: GraphNode[],
  renderLinks: GraphLink[],
  preset: GraphPreset,
  onTick?: () => void,
  options: GraphSimulationOptions = {}
) {
  const {
    graphRefreshAlpha = DEFAULT_GRAPH_REFRESH_ALPHA,
    coolingMode = 'global',
    preserveScopeCentroid = false,
    gravityCenterNodeIds,
    dragPhysics: dragPhysicsOptions,
    paused = false,
    engine = 'main',
    runtimeTelemetryRef,
    onEngineUnavailable,
    onError
  } = options;
  const createSimulationWorker = options.createSimulationWorker;
  const simulationRef = useRef<Simulation<ExtendedSimulationNode, ExtendedSimulationLink> | null>(null);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const workerActiveRef = useRef(false);
  const workerClientRef = useRef<WorkerGraphSimulationClient | null>(null);
  const workerRevisionRef = useRef(0);
  const simulationActivityRef = useRef<GraphSimulationActivity>({
    isActive: () => {
      if (engineRef.current === 'worker') {
        return workerActiveRef.current;
      }

      const simulation = simulationRef.current;
      return !!simulation && simulation.alpha() > simulation.alphaMin();
    },
    stop: () => {
      workerActiveRef.current = false;
      simulationRef.current?.stop();
    }
  });
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onErrorRef = useRef(onError);
  const onEngineUnavailableRef = useRef(onEngineUnavailable);
  onErrorRef.current = onError;
  onEngineUnavailableRef.current = onEngineUnavailable;
  
  // Track previous node coordinates so filter/mode switches preserve positions & velocities rather than resetting
  const nodeCacheRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());
  
  // Keep live physics nodes separate from the render graph.
  const activeNodesRef = useRef<ExtendedSimulationNode[]>([]);
  const renderNodesRef = useRef<ExtendedSimulationNode[]>([]);
  const renderLinksRef = useRef<ExtendedSimulationLink[]>([]);
  const nodeByIdRef = useRef<Map<string, ExtendedSimulationNode>>(new Map());
  const degreeByIdRef = useRef<Map<string, number>>(new Map());
  const latestSimulationNodesRef = useRef(simulationNodes);
  const latestSimulationLinksRef = useRef(simulationLinks);
  const latestRenderNodesRef = useRef(renderNodes);
  const latestRenderLinksRef = useRef(renderLinks);
  const latestGravityCenterNodeIdsRef = useRef(gravityCenterNodeIds);
  const onTickRef = useRef(onTick);
  const payloadSyncedInputsRef = useRef<{
    simulationNodes: GraphNode[];
    renderNodes: GraphNode[];
    renderLinks: GraphLink[];
  } | null>(null);
  
  // Build neighbors map for soft-dragging calculations and neighborhood highlight
  const neighborsMapRef = useRef<Map<string, Set<string>>>(new Map());

  // Topology refreshes are keyed by signatures, so effects read the latest graph
  // through refs instead of capturing the arrays from the last topology change.
  latestSimulationNodesRef.current = simulationNodes;
  latestSimulationLinksRef.current = simulationLinks;
  latestRenderNodesRef.current = renderNodes;
  latestRenderLinksRef.current = renderLinks;
  latestGravityCenterNodeIdsRef.current = gravityCenterNodeIds;
  onTickRef.current = onTick;

  // Set up neighbors adjacency map
  const updateGraphIndexes = useCallback((
    nodesList: ExtendedSimulationNode[],
    adjacencyById: Map<string, Set<string>>,
    degreeById: Map<string, number>
  ) => {
    const nodeById = new Map<string, ExtendedSimulationNode>();

    for (const node of nodesList) {
      nodeById.set(node.id, node);
      node.degree = degreeById.get(node.id) || 0;
    }

    nodeByIdRef.current = nodeById;
    degreeByIdRef.current = degreeById;
    neighborsMapRef.current = adjacencyById;
  }, []);

  const syncRenderGraphRefs = useCallback((nodesToRender: GraphNode[], linksToRender: GraphLink[]) => {
    const activeNodeById = nodeByIdRef.current;
    const renderNodeById = new Map<string, ExtendedSimulationNode>();
    const mappedRenderNodes = nodesToRender.map(node => {
      const activeNode = activeNodeById.get(node.id);
      if (activeNode) {
        renderNodeById.set(node.id, activeNode);
        return activeNode;
      }

      const cached = nodeCacheRef.current.get(node.id);
      const ghostNode: ExtendedSimulationNode = {
        ...node,
        x: cached ? cached.x : (node.x ?? 0),
        y: cached ? cached.y : (node.y ?? 0),
        vx: 0,
        vy: 0
      };
      renderNodeById.set(node.id, ghostNode);
      return ghostNode;
    });
    const mappedRenderLinks = linksToRender.flatMap(link => {
      const source = renderNodeById.get(getLinkId(link.source));
      const target = renderNodeById.get(getLinkId(link.target));

      return source && target
        ? [{ ...link, source, target } as ExtendedSimulationLink]
        : [];
    });

    renderNodesRef.current = mappedRenderNodes;
    renderLinksRef.current = mappedRenderLinks;
    onTickRef.current?.();
  }, []);

  const syncLatestRenderGraphRefs = useCallback(() => {
    syncRenderGraphRefs(latestRenderNodesRef.current, latestRenderLinksRef.current);
  }, [syncRenderGraphRefs]);

  const nodeRadius = preset.nodeRadius ?? 4.5;
  const physics = useMemo(() => resolveGraphPhysicsPreset(preset),
    [preset.physicsPreset, preset.velocityDecay, preset.alphaDecay, preset.dragAlpha, preset.reheatAlpha,
      preset.linkDistance, preset.chargeStrength, preset.collisionRadius, preset.gravityStrength]);
  const { chargeStrength, linkDistance, collisionRadius, gravityStrength, linkStrength,
    degreeNormalizedLinks, collisionStrength, coolCollision, reheatAlpha } = physics;
  const coolingBase = useMemo(
    () => resolveGraphCoolingOptions(coolingMode, coolingMode === 'local' && preset.alphaDecay === undefined ? undefined : physics.alphaDecay),
    [coolingMode, preset.alphaDecay, physics.alphaDecay]
  );
  const timing = useMemo(() => resolvePhysicsTiming({ ...physics, alphaDecay: coolingBase.alphaDecay }), [physics, coolingBase.alphaDecay]);
  const velocityDecay = timing.velocityDecay;
  const coolingOptions = { alphaDecay: timing.alphaDecay, alphaMin: coolingBase.alphaMin };
  const forceConfig = useMemo(() => ({ ...physics, nodeRadius, forceScale: timing.forceScale }), [physics, nodeRadius, timing.forceScale]);
  const dragPhysics = useMemo(
    () => ({
      ...getGraphDragPhysicsForMode(coolingMode),
      ...(coolingMode === 'global' || preset.dragAlpha !== undefined
        ? { startAlphaTarget: preset.physicsPreset === 'legacy' ? physics.dragAlpha : 0, moveAlphaTarget: physics.dragAlpha } : {}),
      ...dragPhysicsOptions
    }),
    [dragPhysicsOptions, coolingMode, physics.dragAlpha, preset.dragAlpha, preset.physicsPreset]
  );
  const topologySignature = useMemo(
    () => getGraphTopologySignature(simulationNodes, simulationLinks),
    [simulationNodes, simulationLinks]
  );
  // Size affects Worker collision forces; labels/metadata and array identity do not.
  const workerSizeSignature = useMemo(() => JSON.stringify(
    simulationNodes.map(node => [node.id, node.size ?? 1] as const)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  ), [simulationNodes]);
  const gravityCenterNodeIdsSignature = useMemo(
    () => getSortedNodeIdSetSignature(gravityCenterNodeIds),
    [gravityCenterNodeIds]
  );

  const syncActiveNodePayloads = useCallback(() => {
    const inputNodeById = new Map(latestSimulationNodesRef.current.map(node => [node.id, node]));
    let sizeChanged = false;

    for (const activeNode of activeNodesRef.current) {
      const inputNode = inputNodeById.get(activeNode.id);
      if (!inputNode) continue;

      sizeChanged = syncSimulationNodePayload(
        activeNode,
        inputNode,
        degreeByIdRef.current.get(activeNode.id) || 0
      ) || sizeChanged;
    }

    return sizeChanged;
  }, []);

  const markPayloadSyncedForLatestInputs = useCallback(() => {
    payloadSyncedInputsRef.current = {
      simulationNodes: latestSimulationNodesRef.current,
      renderNodes: latestRenderNodesRef.current,
      renderLinks: latestRenderLinksRef.current
    };
  }, []);

  const reportSimulationError = useCallback((caught: unknown) => {
    simulationRef.current?.stop();
    workerActiveRef.current = false;

    if (onErrorRef.current) {
      onErrorRef.current(toGraphError(caught));
      return;
    }

    throw caught;
  }, []);

  const reportWorkerUnavailable = useCallback((caught: unknown) => {
    const error = toGraphError(caught);
    workerActiveRef.current = false;

    if (onEngineUnavailableRef.current?.('worker', error)) {
      return;
    }

    reportSimulationError(error);
  }, [reportSimulationError]);

  const releaseSimulationResources = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    simulation.on('tick', null);
    simulation.stop();
    simulationRef.current = null;
    payloadSyncedInputsRef.current = null;
  }, []);

  const releaseWorkerResources = useCallback(() => {
    workerClientRef.current?.dispose();
    workerClientRef.current = null;
    workerActiveRef.current = false;
  }, []);

  useEffect(() => {
    if (engine !== 'main') {
      releaseSimulationResources();
      return;
    }

    try {
      const topologyStartedAt = performance.now();
      const currentSimulationNodes = latestSimulationNodesRef.current;
      const currentSimulationLinks = latestSimulationLinksRef.current;
      const currentGravityCenterNodeIds = latestGravityCenterNodeIdsRef.current;

      // 1. Maintain cached coordinates of the current active nodes before recreating
      if (simulationRef.current) {
        const currentSimNodes = simulationRef.current.nodes();
        for (const n of currentSimNodes) {
          nodeCacheRef.current.set(n.id, {
            x: n.x ?? 0,
            y: n.y ?? 0,
            vx: n.vx ?? 0,
            vy: n.vy ?? 0
          });
        }
      }

      // 2. Build graph indexes once and map incoming nodes to Simulation Nodes, reusing cached layout states
      const { adjacencyById, degreeById, validLinks } = buildGraphIndexes(currentSimulationNodes, currentSimulationLinks);

      const mappedNodes: ExtendedSimulationNode[] = currentSimulationNodes.map(node => {
        const cached = nodeCacheRef.current.get(node.id);

        return {
          ...node,
          degree: degreeById.get(node.id) || 0,
          x: cached ? cached.x : (node.x ?? (Math.random() - 0.5) * 150),
          y: cached ? cached.y : (node.y ?? (Math.random() - 0.5) * 150),
          vx: cached ? cached.vx : (node.vx ?? 0),
          vy: cached ? cached.vy : (node.vy ?? 0)
        };
      });

      // 3. Map links
      const mappedLinks: ExtendedSimulationLink[] = validLinks.map(link => ({
        ...link,
        // Source & target can be string during setup; d3-force resolves them to object references
        source: getLinkId(link.source),
        target: getLinkId(link.target)
      }));
      const gravityCenterNodes = currentGravityCenterNodeIds
        ? mappedNodes.filter(node => currentGravityCenterNodeIds.has(node.id))
        : mappedNodes;
      const gravityCenter = resolveSimulationGravityCenter(
        gravityCenterNodes.length > 0 ? gravityCenterNodes : mappedNodes,
        preserveScopeCentroid
      );

      activeNodesRef.current = mappedNodes;
      updateGraphIndexes(mappedNodes, adjacencyById, degreeById);

      // 4. Update the existing simulation so lens scope changes keep their layout continuity.
      const sim = simulationRef.current ?? withFixedSimulationClock(forceSimulation<ExtendedSimulationNode>(mappedNodes));
      sim.force('link', null).nodes(mappedNodes);
      applyPhysicsForces(sim, mappedLinks, forceConfig, gravityCenter);
      sim
        .alphaDecay(coolingOptions.alphaDecay)
        .alphaMin(coolingOptions.alphaMin)
        .velocityDecay(velocityDecay)
        .alpha(Math.max(sim.alpha(), simulationRef.current ? graphRefreshAlpha : 1));

      if (pausedRef.current) {
        sim.stop();
      } else {
        sim.restart();
      }

      sim.on('tick', () => {
        try {
          if (__OGRAPH_DEBUG_RUNTIME__ && runtimeTelemetryRef) {
            runtimeTelemetryRef.current.simulation = 'main';
            runtimeTelemetryRef.current.simulationUpdateCount += 1;
            runtimeTelemetryRef.current.lastSimulationUpdateAt = performance.now();
          }
          onTickRef.current?.();
        } catch (caught) {
          reportSimulationError(caught);
        }
      });

      simulationRef.current = sim;
      // Active node objects are recreated above; keep render ghosts aligned even
      // while the render graph is still holding the previous lens transition set.
      syncLatestRenderGraphRefs();
      markPayloadSyncedForLatestInputs();
      if (__OGRAPH_DEBUG_RUNTIME__ && runtimeTelemetryRef) {
        runtimeTelemetryRef.current.topologySyncDurationMs = performance.now() - topologyStartedAt;
      }
    } catch (caught) {
      reportSimulationError(caught);
    }
  }, [
    topologySignature,
    engine,
    chargeStrength,
    linkDistance,
    nodeRadius,
    collisionRadius,
    gravityStrength,
    velocityDecay,
    linkStrength, degreeNormalizedLinks, collisionStrength, coolCollision, forceConfig,
    coolingOptions.alphaDecay,
    coolingOptions.alphaMin,
    gravityCenterNodeIdsSignature,
    graphRefreshAlpha,
    preserveScopeCentroid,
    runtimeTelemetryRef,
    releaseSimulationResources,
    markPayloadSyncedForLatestInputs,
    reportSimulationError,
    syncLatestRenderGraphRefs,
    updateGraphIndexes
  ]);

  useEffect(() => {
    if (engine !== 'worker') {
      releaseWorkerResources();
      return;
    }

    releaseSimulationResources();

    if (!createSimulationWorker) {
      reportWorkerUnavailable(new Error('No graph simulation Worker factory was provided.'));
      return;
    }

    let disposed = false;
    const revision = workerRevisionRef.current + 1;
    workerRevisionRef.current = revision;
    const workerConfig: WorkerSimulationConfig = {
      ...forceConfig,
      chargeStrength,
      linkDistance,
      nodeRadius,
      collisionRadius,
      gravityStrength,
      velocityDecay,
      linkStrength, degreeNormalizedLinks, collisionStrength, coolCollision,
      alphaDecay: coolingOptions.alphaDecay,
      alphaMin: coolingOptions.alphaMin,
      graphRefreshAlpha,
      preserveScopeCentroid,
      gravityCenterNodeIds: gravityCenterNodeIds ? [...gravityCenterNodeIds] : null,
      paused: pausedRef.current
    };

    void import('./workerGraphSimulationClient')
      .then(({ createWorkerGraphSimulationClient }) => {
        if (disposed) return;

        const client = createWorkerGraphSimulationClient({
          createWorker: createSimulationWorker,
          revision,
          nodes: latestSimulationNodesRef.current,
          links: latestSimulationLinksRef.current,
          cachedPositions: nodeCacheRef.current,
          config: workerConfig,
          onGraphReady: (snapshot, topologySyncDurationMs) => {
            if (disposed) return;
            const mappedNodes = snapshot.nodes as ExtendedSimulationNode[];
            activeNodesRef.current = mappedNodes;
            updateGraphIndexes(mappedNodes, snapshot.adjacencyById, snapshot.degreeById);
            syncLatestRenderGraphRefs();
            markPayloadSyncedForLatestInputs();

            if (__OGRAPH_DEBUG_RUNTIME__ && runtimeTelemetryRef) {
              runtimeTelemetryRef.current.simulation = 'worker';
              runtimeTelemetryRef.current.topologySyncDurationMs = topologySyncDurationMs;
            }
          },
          onActiveChange: active => {
            workerActiveRef.current = active;
          },
          onTick: receivedAt => {
            if (disposed) return;
            if (__OGRAPH_DEBUG_RUNTIME__ && runtimeTelemetryRef) {
              runtimeTelemetryRef.current.simulation = 'worker';
              runtimeTelemetryRef.current.simulationUpdateCount += 1;
              runtimeTelemetryRef.current.lastSimulationUpdateAt = receivedAt;
              runtimeTelemetryRef.current.workerResultAgeMs = 0;
            }
            onTickRef.current?.();
          },
          onReady: () => {
            if (__OGRAPH_DEBUG_RUNTIME__ && runtimeTelemetryRef) {
              runtimeTelemetryRef.current.simulation = 'worker';
            }
          },
          onError: reportWorkerUnavailable
        });

        workerClientRef.current = client;
        client.start();
        client.setPaused(pausedRef.current);
      })
      .catch(caught => {
        if (!disposed) {
          releaseWorkerResources();
          reportWorkerUnavailable(caught);
        }
      });

    return () => {
      disposed = true;
      if (workerRevisionRef.current === revision) {
        releaseWorkerResources();
      }
    };
  }, [
    engine,
    topologySignature,
    workerSizeSignature,
    chargeStrength,
    linkDistance,
    nodeRadius,
    collisionRadius,
    gravityStrength,
    velocityDecay,
    linkStrength, degreeNormalizedLinks, collisionStrength, coolCollision, forceConfig,
    coolingOptions.alphaDecay,
    coolingOptions.alphaMin,
    graphRefreshAlpha,
    preserveScopeCentroid,
    gravityCenterNodeIdsSignature,
    createSimulationWorker,
    runtimeTelemetryRef,
    markPayloadSyncedForLatestInputs,
    releaseSimulationResources,
    releaseWorkerResources,
    reportWorkerUnavailable,
    syncLatestRenderGraphRefs,
    updateGraphIndexes
  ]);

  useEffect(() => {
    // Both engines share the rendered node objects. Payload-only updates must
    // reach callbacks/renderers without restarting the Worker or its clock.
    try {
      const syncedInputs = payloadSyncedInputsRef.current;
      if (
        syncedInputs?.simulationNodes === latestSimulationNodesRef.current &&
        syncedInputs.renderNodes === latestRenderNodesRef.current &&
        syncedInputs.renderLinks === latestRenderLinksRef.current
      ) {
        return;
      }

      const sizeChanged = syncActiveNodePayloads();
      // Nodes leaving physics remain as frozen render ghosts until their lens fade completes.
      syncLatestRenderGraphRefs();
      markPayloadSyncedForLatestInputs();

      const simulation = simulationRef.current;
      if (sizeChanged && simulation) {
        simulation.force('collide', createConfiguredCollision<ExtendedSimulationNode>(forceConfig));
        simulation.alpha(Math.max(simulation.alpha(), simulation.alphaMin() + 0.01));

        if (pausedRef.current) {
          simulation.stop();
        } else {
          simulation.restart();
        }
      }
    } catch (caught) {
      reportSimulationError(caught);
    }
  }, [
    simulationNodes,
    engine,
    renderNodes,
    renderLinks,
    nodeRadius,
    collisionRadius,
    forceConfig,
    markPayloadSyncedForLatestInputs,
    reportSimulationError,
    syncActiveNodePayloads,
    syncLatestRenderGraphRefs
  ]);

  useEffect(() => {
    if (engine !== 'main') return;

    const simulation = simulationRef.current;
    if (!simulation) return;

    if (paused) {
      simulation.stop();
    } else if (simulation.alpha() > simulation.alphaMin()) {
      simulation.restart();
    }
  }, [engine, paused]);

  useEffect(() => {
    if (engine === 'worker') {
      workerClientRef.current?.setPaused(paused);
    }
  }, [engine, paused]);

  useEffect(() => {
    return () => {
      releaseSimulationResources();
      releaseWorkerResources();
    };
  }, [releaseSimulationResources, releaseWorkerResources]);

  // Node Dragging Physics Control
  const dragStart = useCallback((nodeId: string) => {
    if (engineRef.current === 'worker') {
      const targetNode = nodeByIdRef.current.get(nodeId);
      if (targetNode) {
        targetNode.dragX = targetNode.x;
        targetNode.dragY = targetNode.y;
        targetNode.fx = targetNode.x;
        targetNode.fy = targetNode.y;
      }
      workerClientRef.current?.dragStart(nodeId, dragPhysics.startAlphaTarget);
      return;
    }
    if (!simulationRef.current) return;

    if (!pausedRef.current && dragPhysics.startAlphaTarget > 0) {
      simulationRef.current
        .alpha(Math.max(simulationRef.current.alpha(), dragPhysics.startAlphaTarget))
        .alphaTarget(dragPhysics.startAlphaTarget).restart();
    }
    
    const targetNode = nodeByIdRef.current.get(nodeId);
    if (targetNode) {
      targetNode.dragX = targetNode.x;
      targetNode.dragY = targetNode.y;
      targetNode.fx = targetNode.x;
      targetNode.fy = targetNode.y;
    }
  }, [dragPhysics.startAlphaTarget]);

  const dragMove = useCallback((nodeId: string, worldX: number, worldY: number) => {
    if (engineRef.current === 'worker') {
      const targetNode = nodeByIdRef.current.get(nodeId);
      if (targetNode) {
        targetNode.fx = worldX;
        targetNode.fy = worldY;
        targetNode.x = worldX;
        targetNode.y = worldY;
        onTickRef.current?.();
      }
      workerClientRef.current?.dragMove(
        nodeId,
        worldX,
        worldY,
        dragPhysics.moveAlphaTarget
      );
      return;
    }
    const targetNode = nodeByIdRef.current.get(nodeId);
    if (!targetNode) return;

    targetNode.fx = worldX;
    targetNode.fy = worldY;
    targetNode.x = worldX;
    targetNode.y = worldY;

    if (simulationRef.current && !pausedRef.current && dragPhysics.moveAlphaTarget > 0) {
      simulationRef.current
        .alpha(Math.max(simulationRef.current.alpha(), dragPhysics.moveAlphaTarget))
        .alphaTarget(dragPhysics.moveAlphaTarget).restart();
    }
  }, [dragPhysics.moveAlphaTarget]);

  const dragEnd = useCallback((nodeId: string) => {
    if (engineRef.current === 'worker') {
      const targetNode = nodeByIdRef.current.get(nodeId);
      if (targetNode) {
        targetNode.dragX = targetNode.dragY = undefined;
        targetNode.fx = null;
        targetNode.fy = null;
      }
      workerClientRef.current?.dragEnd(nodeId);
      return;
    }
    if (!simulationRef.current) return;
    simulationRef.current.alphaTarget(0); // return to normal decay
    
    const targetNode = nodeByIdRef.current.get(nodeId);
    if (targetNode) {
      targetNode.dragX = targetNode.dragY = undefined;
      targetNode.fx = null;
      targetNode.fy = null;
    }
  }, []);

  const restartSimulation = useCallback(() => {
    if (pausedRef.current) return;
    if (engineRef.current === 'worker') {
      workerClientRef.current?.restart(reheatAlpha);
      return;
    }
    simulationRef.current?.alpha(reheatAlpha).restart();
  }, [reheatAlpha]);

  return {
    simulationRef,
    simulationActivityRef,
    activeNodesRef,
    renderNodesRef,
    renderLinksRef,
    neighborsMapRef,
    nodeByIdRef,
    degreeByIdRef,
    dragStart,
    dragMove,
    dragEnd,
    restartSimulation
  };
}
