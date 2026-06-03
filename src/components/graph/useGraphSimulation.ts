import { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceX,
  forceY,
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum
} from 'd3-force';
import type { GraphNode, GraphLink, GraphPreset, GraphViewMode } from './types';
import { getNodeRadius } from './graphMath';
import { getLinkId } from './localGraph';
import { buildGraphIndexes } from './graphIndexes';

interface ExtendedSimulationNode extends SimulationNodeDatum, GraphNode {}
interface ExtendedSimulationLink extends SimulationLinkDatum<ExtendedSimulationNode> {
  source: string | ExtendedSimulationNode;
  target: string | ExtendedSimulationNode;
  weight?: number;
  type?: string;
  label?: string;
}

const DIRECT_NEIGHBOR_INFLUENCE = 0.42;
const SECOND_DEGREE_INFLUENCE = 0.16;
const MAX_NEIGHBOR_SHIFT = 22;
const MIN_CONNECTED_DRAG_INFLUENCE = 0.16;
const DIRECT_NEIGHBOR_POSITION_FOLLOW = 0.16;
const SECOND_DEGREE_POSITION_FOLLOW = 0.05;
const MAX_WAKE_DEPTH = 2;
const PHYSICS_NODE_SIZE_SCALE = 1.0;
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
  wakeConnectedNodes: boolean;
}

export interface GraphCoolingOptions {
  alphaDecay: number;
  alphaMin: number;
}

export const DEFAULT_GRAPH_DRAG_PHYSICS: GraphDragPhysicsOptions = {
  startAlphaTarget: 0.78,
  moveAlphaTarget: 0.72,
  wakeConnectedNodes: true
};

export const LOCAL_LENS_DRAG_PHYSICS: GraphDragPhysicsOptions = {
  startAlphaTarget: 0.08,
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
  onError?: (error: Error) => void;
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

function resolveGraphDragPhysicsOptions(
  options?: Partial<GraphDragPhysicsOptions>
): GraphDragPhysicsOptions {
  return {
    ...DEFAULT_GRAPH_DRAG_PHYSICS,
    ...options
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

function clampShift(value: number) {
  return Math.max(-MAX_NEIGHBOR_SHIFT, Math.min(MAX_NEIGHBOR_SHIFT, value));
}

function getDegreeWeightedDragInfluence(nodeDegree: number, baseInfluence: number, minInfluence = MIN_CONNECTED_DRAG_INFLUENCE) {
  if (nodeDegree <= 1) {
    return 1;
  }

  return Math.max(minInfluence, baseInfluence / Math.pow(nodeDegree - 1, 0.34));
}

function getWakeForDepth(depth: number) {
  return {
    minInfluence: MIN_CONNECTED_DRAG_INFLUENCE,
    positionFollow: depth === 1 ? DIRECT_NEIGHBOR_POSITION_FOLLOW : SECOND_DEGREE_POSITION_FOLLOW,
    strength: depth === 1 ? DIRECT_NEIGHBOR_INFLUENCE : SECOND_DEGREE_INFLUENCE
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

function createCollisionForce(nodeRadius: number, collisionRadius: number) {
  return forceCollide<ExtendedSimulationNode>()
    .radius(d => {
      const r = getNodeRadius(nodeRadius, PHYSICS_NODE_SIZE_SCALE, d.size, d.degree);
      return r + collisionRadius;
    })
    .strength(0.9);
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
    onError
  } = options;
  const simulationRef = useRef<Simulation<ExtendedSimulationNode, ExtendedSimulationLink> | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  
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

  const chargeStrength = preset.chargeStrength ?? -50;
  const linkDistance = preset.linkDistance ?? 45;
  const nodeRadius = preset.nodeRadius ?? 4.5;
  const collisionRadius = preset.collisionRadius ?? 5;
  const gravityStrength = preset.gravityStrength ?? 0.1;
  const velocityDecay = resolveVelocityDecay(preset.velocityDecay);
  const coolingOptions = useMemo(
    () => resolveGraphCoolingOptions(coolingMode, preset.alphaDecay),
    [coolingMode, preset.alphaDecay]
  );
  const dragPhysics = useMemo(
    () => resolveGraphDragPhysicsOptions(dragPhysicsOptions),
    [dragPhysicsOptions]
  );
  const topologySignature = useMemo(
    () => getGraphTopologySignature(simulationNodes, simulationLinks),
    [simulationNodes, simulationLinks]
  );
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

    if (onErrorRef.current) {
      onErrorRef.current(toGraphError(caught));
      return;
    }

    throw caught;
  }, []);

  const releaseSimulationResources = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    simulation.on('tick', null);
    simulation.stop();
    simulationRef.current = null;
    payloadSyncedInputsRef.current = null;
  }, []);

  useEffect(() => {
    try {
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
      const sim = simulationRef.current ?? forceSimulation<ExtendedSimulationNode>(mappedNodes);
      const linkForce = forceLink<ExtendedSimulationNode, ExtendedSimulationLink>()
        .id(d => d.id)
        .distance(linkDistance)
        .strength(0.85);
      sim.force('link', null).nodes(mappedNodes);

      sim
        .alphaDecay(coolingOptions.alphaDecay)
        .alphaMin(coolingOptions.alphaMin)
        .velocityDecay(velocityDecay)
        .force('charge', forceManyBody().strength(chargeStrength))
        .force('link', linkForce.links(mappedLinks))
        .force('collide', createCollisionForce(nodeRadius, collisionRadius))
        // Gentle gravity around the visible scope center stops sparse lenses drifting back to origin.
        .force('x', forceX<ExtendedSimulationNode>(gravityCenter.x).strength(gravityStrength * 0.4))
        .force('y', forceY<ExtendedSimulationNode>(gravityCenter.y).strength(gravityStrength * 0.4))
        .alpha(Math.max(sim.alpha(), simulationRef.current ? graphRefreshAlpha : 1));

      if (pausedRef.current) {
        sim.stop();
      } else {
        sim.restart();
      }

      sim.on('tick', () => {
        try {
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
    } catch (caught) {
      reportSimulationError(caught);
    }
  }, [
    topologySignature,
    chargeStrength,
    linkDistance,
    nodeRadius,
    collisionRadius,
    gravityStrength,
    velocityDecay,
    coolingOptions.alphaDecay,
    coolingOptions.alphaMin,
    gravityCenterNodeIdsSignature,
    graphRefreshAlpha,
    preserveScopeCentroid,
    markPayloadSyncedForLatestInputs,
    reportSimulationError,
    syncLatestRenderGraphRefs,
    updateGraphIndexes
  ]);

  useEffect(() => {
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
        simulation.force('collide', createCollisionForce(nodeRadius, collisionRadius));
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
    renderNodes,
    renderLinks,
    nodeRadius,
    collisionRadius,
    markPayloadSyncedForLatestInputs,
    reportSimulationError,
    syncActiveNodePayloads,
    syncLatestRenderGraphRefs
  ]);

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    if (paused) {
      simulation.stop();
    } else if (simulation.alpha() > simulation.alphaMin()) {
      simulation.restart();
    }
  }, [paused]);

  useEffect(() => {
    return () => {
      releaseSimulationResources();
    };
  }, [releaseSimulationResources]);

  // Node Dragging Physics Control
  const dragStart = useCallback((nodeId: string) => {
    if (!simulationRef.current) return;

    if (!pausedRef.current && dragPhysics.startAlphaTarget > 0) {
      simulationRef.current.alphaTarget(dragPhysics.startAlphaTarget).restart();
    }
    
    const targetNode = nodeByIdRef.current.get(nodeId);
    if (targetNode) {
      targetNode.fx = targetNode.x;
      targetNode.fy = targetNode.y;
    }
  }, [dragPhysics.startAlphaTarget]);

  const dragMove = useCallback((nodeId: string, worldX: number, worldY: number) => {
    const targetNode = nodeByIdRef.current.get(nodeId);
    if (!targetNode) return;

    const previousX = targetNode.fx ?? targetNode.x ?? worldX;
    const previousY = targetNode.fy ?? targetNode.y ?? worldY;
    const dx = worldX - previousX;
    const dy = worldY - previousY;
    
    targetNode.fx = worldX;
    targetNode.fy = worldY;
    targetNode.x = worldX;
    targetNode.y = worldY;

    if (dragPhysics.wakeConnectedNodes) {
      const nodeById = nodeByIdRef.current;
      const neighborsMap = neighborsMapRef.current;
      const applyInfluence = (neighId: string, strength: number, positionFollow: number, minInfluence: number) => {
        const neighbor = nodeById.get(neighId);
        if (!neighbor || neighbor.fx != null || neighbor.id === nodeId) {
          return;
        }

        const nodeDegree = degreeByIdRef.current.get(neighId) ?? neighbor.degree ?? 1;
        const weightedStrength = getDegreeWeightedDragInfluence(nodeDegree, strength, minInfluence);
        const shiftX = clampShift(dx * weightedStrength);
        const shiftY = clampShift(dy * weightedStrength);
        const neighborX = neighbor.x ?? 0;
        const neighborY = neighbor.y ?? 0;
        const offsetX = neighborX - worldX;
        const offsetY = neighborY - worldY;
        const distance = Math.hypot(offsetX, offsetY) || 1;
        const wakeFalloff = Math.max(0.18, 1 - distance / 420);
        const positionShiftX = shiftX * positionFollow * wakeFalloff;
        const positionShiftY = shiftY * positionFollow * wakeFalloff;

        neighbor.x = neighborX + positionShiftX;
        neighbor.y = neighborY + positionShiftY;
        neighbor.vx = ((neighbor.vx ?? 0) + shiftX * wakeFalloff) * 0.82;
        neighbor.vy = ((neighbor.vy ?? 0) + shiftY * wakeFalloff) * 0.82;
      };

      const visited = new Set<string>([nodeId]);
      const queue: { id: string; depth: number }[] = [{ id: nodeId, depth: 0 }];

      for (let index = 0; index < queue.length; index++) {
        const current = queue[index]!;
        if (current.depth >= MAX_WAKE_DEPTH) continue;

        const neighbors = neighborsMap.get(current.id);
        if (!neighbors) continue;

        neighbors.forEach(neighborId => {
          if (visited.has(neighborId)) return;

          visited.add(neighborId);
          const depth = current.depth + 1;
          const wake = getWakeForDepth(depth);
          applyInfluence(neighborId, wake.strength, wake.positionFollow, wake.minInfluence);

          if (depth < MAX_WAKE_DEPTH) {
            queue.push({ id: neighborId, depth });
          }
        });
      }
    }

    if (simulationRef.current && !pausedRef.current && dragPhysics.moveAlphaTarget > 0) {
      simulationRef.current.alphaTarget(dragPhysics.moveAlphaTarget).restart();
    }
  }, [dragPhysics.moveAlphaTarget, dragPhysics.wakeConnectedNodes]);

  const dragEnd = useCallback((nodeId: string) => {
    if (!simulationRef.current) return;
    simulationRef.current.alphaTarget(0); // return to normal decay
    
    const targetNode = nodeByIdRef.current.get(nodeId);
    if (targetNode) {
      targetNode.fx = null;
      targetNode.fy = null;
    }
  }, []);

  const restartSimulation = useCallback(() => {
    if (simulationRef.current) {
      simulationRef.current.alpha(1);

      if (pausedRef.current) {
        simulationRef.current.stop();
      } else {
        simulationRef.current.restart();
      }
    }
  }, []);

  return {
    simulationRef,
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
