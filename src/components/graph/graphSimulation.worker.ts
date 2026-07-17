/// <reference lib="webworker" />

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY
} from 'd3-force';
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { getNodeRadius } from './graphMath';
import {
  GRAPH_SIMULATION_PROTOCOL_VERSION,
  type GraphSimulationWorkerRequest,
  type GraphSimulationWorkerResponse,
  type WorkerSimulationConfig,
  type WorkerSimulationNodeInput
} from './graphSimulationProtocol';

type WorkerNode = SimulationNodeDatum & WorkerSimulationNodeInput;

interface WorkerLink extends SimulationLinkDatum<WorkerNode> {
  source: string | WorkerNode;
  target: string | WorkerNode;
}

const PHYSICS_NODE_SIZE_SCALE = 1;
const MAX_PUBLISH_RATE_MS = 1000 / 60;
const MAX_BUFFER_POOL_SIZE = 3;
const MAX_WAKE_DEPTH = 2;
const MAX_NEIGHBOR_SHIFT = 22;
const MIN_CONNECTED_DRAG_INFLUENCE = 0.16;
const DIRECT_NEIGHBOR_INFLUENCE = 0.42;
const SECOND_DEGREE_INFLUENCE = 0.16;
const DIRECT_NEIGHBOR_POSITION_FOLLOW = 0.16;
const SECOND_DEGREE_POSITION_FOLLOW = 0.05;

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<GraphSimulationWorkerRequest>) => void) | null;
  postMessage: (message: GraphSimulationWorkerResponse, transfer?: Transferable[]) => void;
};

let revision = 0;
let simulation: Simulation<WorkerNode, WorkerLink> | null = null;
let nodes: WorkerNode[] = [];
let nodeById = new Map<string, WorkerNode>();
let neighborsById = new Map<string, Set<string>>();
let config: WorkerSimulationConfig | null = null;
let lastPublishedAt = Number.NEGATIVE_INFINITY;
const recycledPositionBuffers: ArrayBuffer[] = [];

function post(message: GraphSimulationWorkerResponse, transfer?: Transferable[]) {
  workerScope.postMessage(message, transfer);
}

function reportError(caught: unknown) {
  const error = caught instanceof Error ? caught : new Error(String(caught));
  post({
    type: 'error',
    revision,
    message: error.message,
    stack: error.stack
  });
}

function resolveGravityCenter(
  allNodes: WorkerNode[],
  gravityCenterNodeIds: string[] | null,
  preserveScopeCentroid: boolean
) {
  if (!preserveScopeCentroid) return { x: 0, y: 0 };

  const eligibleIds = gravityCenterNodeIds ? new Set(gravityCenterNodeIds) : null;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const node of allNodes) {
    if (eligibleIds && !eligibleIds.has(node.id)) continue;

    const x = node.x ?? 0;
    const y = node.y ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    sumX += x;
    sumY += y;
    count += 1;
  }

  return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0, y: 0 };
}

function buildNeighbors(links: WorkerLink[]) {
  const next = new Map<string, Set<string>>();
  for (const node of nodes) next.set(node.id, new Set());

  for (const link of links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    next.get(sourceId)?.add(targetId);
    next.get(targetId)?.add(sourceId);
  }

  neighborsById = next;
}

function takePositionBuffer(): ArrayBuffer {
  const requiredBytes = nodes.length * 2 * Float32Array.BYTES_PER_ELEMENT;

  while (recycledPositionBuffers.length > 0) {
    const candidate = recycledPositionBuffers.pop()!;
    if (candidate.byteLength === requiredBytes) return candidate;
  }

  return new ArrayBuffer(requiredBytes);
}

function publishPositions(force = false) {
  const now = performance.now();
  if (!force && now - lastPublishedAt < MAX_PUBLISH_RATE_MS) return;
  lastPublishedAt = now;

  const buffer = takePositionBuffer();
  const packed = new Float32Array(buffer);

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    packed[index * 2] = node.x ?? 0;
    packed[index * 2 + 1] = node.y ?? 0;
  }

  post({
    type: 'tick',
    revision,
    alpha: simulation?.alpha() ?? 0,
    positions: buffer
  }, [buffer]);
}

function stopSimulation() {
  if (!simulation) return;
  simulation.on('tick', null).on('end', null).stop();
  simulation = null;
}

function initialize(message: Extract<GraphSimulationWorkerRequest, { type: 'initialize' }>) {
  stopSimulation();
  revision = message.revision;
  config = message.config;
  recycledPositionBuffers.length = 0;
  lastPublishedAt = Number.NEGATIVE_INFINITY;

  nodes = message.nodes.map(node => ({ ...node }));
  nodeById = new Map(nodes.map(node => [node.id, node]));
  const links: WorkerLink[] = message.links.map(link => ({ ...link }));
  buildNeighbors(links);

  const gravityCenter = resolveGravityCenter(
    nodes,
    config.gravityCenterNodeIds,
    config.preserveScopeCentroid
  );
  const linkForce = forceLink<WorkerNode, WorkerLink>()
    .id(node => node.id)
    .distance(config.linkDistance)
    .strength(0.85)
    .links(links);
  const nextSimulation = forceSimulation<WorkerNode>(nodes)
    .alphaDecay(config.alphaDecay)
    .alphaMin(config.alphaMin)
    .velocityDecay(config.velocityDecay)
    .force('charge', forceManyBody<WorkerNode>().strength(config.chargeStrength))
    .force('link', linkForce)
    .force(
      'collide',
      forceCollide<WorkerNode>()
        .radius(node => (
          getNodeRadius(config!.nodeRadius, PHYSICS_NODE_SIZE_SCALE, node.size, node.degree) +
          config!.collisionRadius
        ))
        .strength(0.9)
    )
    .force('x', forceX<WorkerNode>(gravityCenter.x).strength(config.gravityStrength * 0.4))
    .force('y', forceY<WorkerNode>(gravityCenter.y).strength(config.gravityStrength * 0.4))
    .alpha(1)
    .on('tick', () => publishPositions())
    .on('end', () => {
      publishPositions(true);
      post({ type: 'settled', revision, alpha: nextSimulation.alpha() });
    });

  simulation = nextSimulation;
  post({
    type: 'ready',
    protocolVersion: GRAPH_SIMULATION_PROTOCOL_VERSION,
    revision,
    nodeCount: nodes.length
  });
  publishPositions(true);

  if (config.paused) {
    nextSimulation.stop();
  } else {
    nextSimulation.restart();
  }
}

function clampShift(value: number) {
  return Math.max(-MAX_NEIGHBOR_SHIFT, Math.min(MAX_NEIGHBOR_SHIFT, value));
}

function getDegreeWeightedDragInfluence(
  nodeDegree: number,
  baseInfluence: number,
  minInfluence = MIN_CONNECTED_DRAG_INFLUENCE
) {
  if (nodeDegree <= 1) return 1;
  return Math.max(minInfluence, baseInfluence / Math.pow(nodeDegree - 1, 0.34));
}

function wakeConnectedNodes(nodeId: string, worldX: number, worldY: number, dx: number, dy: number) {
  const visited = new Set<string>([nodeId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current.depth >= MAX_WAKE_DEPTH) continue;

    for (const neighborId of neighborsById.get(current.id) ?? []) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);

      const depth = current.depth + 1;
      const neighbor = nodeById.get(neighborId);
      if (neighbor && neighbor.fx == null) {
        const baseInfluence = depth === 1 ? DIRECT_NEIGHBOR_INFLUENCE : SECOND_DEGREE_INFLUENCE;
        const positionFollow = depth === 1
          ? DIRECT_NEIGHBOR_POSITION_FOLLOW
          : SECOND_DEGREE_POSITION_FOLLOW;
        const weightedStrength = getDegreeWeightedDragInfluence(neighbor.degree, baseInfluence);
        const shiftX = clampShift(dx * weightedStrength);
        const shiftY = clampShift(dy * weightedStrength);
        const neighborX = neighbor.x ?? 0;
        const neighborY = neighbor.y ?? 0;
        const distance = Math.hypot(neighborX - worldX, neighborY - worldY) || 1;
        const wakeFalloff = Math.max(0.18, 1 - distance / 420);

        neighbor.x = neighborX + shiftX * positionFollow * wakeFalloff;
        neighbor.y = neighborY + shiftY * positionFollow * wakeFalloff;
        neighbor.vx = ((neighbor.vx ?? 0) + shiftX * wakeFalloff) * 0.82;
        neighbor.vy = ((neighbor.vy ?? 0) + shiftY * wakeFalloff) * 0.82;
      }

      if (depth < MAX_WAKE_DEPTH) queue.push({ id: neighborId, depth });
    }
  }
}

function handleRequest(message: GraphSimulationWorkerRequest) {
  if (message.type === 'initialize') {
    if (message.protocolVersion !== GRAPH_SIMULATION_PROTOCOL_VERSION) {
      revision = message.revision;
      throw new Error(`Unsupported graph simulation protocol: ${message.protocolVersion}`);
    }
    initialize(message);
    return;
  }

  if (message.revision !== revision) return;

  switch (message.type) {
    case 'set-paused':
      if (!simulation) return;
      if (config) config.paused = message.paused;
      if (message.paused) {
        simulation.stop();
      } else if (simulation.alpha() > simulation.alphaMin()) {
        simulation.restart();
      }
      return;
    case 'restart':
      if (!config?.paused) simulation?.alpha(message.alpha).restart();
      return;
    case 'drag-start': {
      const node = nodeById.get(message.nodeId);
      if (!node || !simulation) return;
      node.fx = node.x;
      node.fy = node.y;
      if (!config?.paused && message.alphaTarget > 0) {
        simulation.alphaTarget(message.alphaTarget).restart();
      }
      return;
    }
    case 'drag-move': {
      const node = nodeById.get(message.nodeId);
      if (!node || !simulation) return;
      const previousX = node.fx ?? node.x ?? message.x;
      const previousY = node.fy ?? node.y ?? message.y;
      const dx = message.x - previousX;
      const dy = message.y - previousY;
      node.fx = message.x;
      node.fy = message.y;
      node.x = message.x;
      node.y = message.y;
      if (message.wakeConnectedNodes) {
        wakeConnectedNodes(message.nodeId, message.x, message.y, dx, dy);
      }
      if (!config?.paused && message.alphaTarget > 0) {
        simulation.alphaTarget(message.alphaTarget).restart();
      }
      publishPositions(true);
      return;
    }
    case 'drag-end': {
      const node = nodeById.get(message.nodeId);
      if (!node || !simulation) return;
      node.fx = null;
      node.fy = null;
      simulation.alphaTarget(0);
      return;
    }
    case 'recycle':
      if (
        recycledPositionBuffers.length < MAX_BUFFER_POOL_SIZE &&
        message.positions.byteLength === nodes.length * 2 * Float32Array.BYTES_PER_ELEMENT
      ) {
        recycledPositionBuffers.push(message.positions);
      }
      return;
    case 'dispose':
      stopSimulation();
      nodes = [];
      nodeById.clear();
      neighborsById.clear();
      recycledPositionBuffers.length = 0;
      return;
  }
}

workerScope.onmessage = event => {
  try {
    handleRequest(event.data);
  } catch (caught) {
    reportError(caught);
  }
};
