import { applyPhysicsForces } from './graphPhysics';
/// <reference lib="webworker" />

import { forceSimulation } from 'd3-force';
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import {
  GRAPH_SIMULATION_PROTOCOL_VERSION,
  type GraphSimulationWorkerRequest,
  type GraphSimulationWorkerResponse,
  type WorkerSimulationConfig,
  type WorkerSimulationNodeInput
} from './graphSimulationProtocol';

type WorkerNode = SimulationNodeDatum & WorkerSimulationNodeInput & { dragX?: number; dragY?: number };

interface WorkerLink extends SimulationLinkDatum<WorkerNode> {
  source: string | WorkerNode;
  target: string | WorkerNode;
}

const TICK_INTERVAL_MS = 1000 / 60;
const MAX_BUFFER_POOL_SIZE = 3;
const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<GraphSimulationWorkerRequest>) => void) | null;
  postMessage: (message: GraphSimulationWorkerResponse, transfer?: Transferable[]) => void;
};

let revision = 0;
let simulation: Simulation<WorkerNode, WorkerLink> | null = null;
let nodes: WorkerNode[] = [];
let nodeById = new Map<string, WorkerNode>();
let config: WorkerSimulationConfig | null = null;
let tickTimer: ReturnType<typeof setTimeout> | null = null;
let nextTickAt = 0;
let dragSequence = 0;
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

function takePositionBuffer(): ArrayBuffer {
  const requiredBytes = nodes.length * 2 * Float32Array.BYTES_PER_ELEMENT;

  while (recycledPositionBuffers.length > 0) {
    const candidate = recycledPositionBuffers.pop()!;
    if (candidate.byteLength === requiredBytes) return candidate;
  }

  return new ArrayBuffer(requiredBytes);
}

function publishPositions() {
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
    dragSequence,
    positions: buffer
  }, [buffer]);
}

function stopTicks() {
  if (tickTimer !== null) clearTimeout(tickTimer);
  tickTimer = null;
}

function tick() {
  tickTimer = null;
  if (!simulation || config?.paused || nodes.length === 0) return;
  try {
    simulation.tick();
    publishPositions();
    if (simulation.alpha() > simulation.alphaMin()) {
      // Count force computation inside the frame budget. d3-timer's Worker
      // fallback otherwise adds another 17ms after each complete force step.
      nextTickAt = Math.max(nextTickAt + TICK_INTERVAL_MS, performance.now());
      tickTimer = setTimeout(tick, Math.max(0, nextTickAt - performance.now()));
    } else {
      post({ type: 'settled', revision, alpha: simulation.alpha() });
    }
  } catch (caught) {
    reportError(caught);
  }
}

function startTicks() {
  if (tickTimer !== null || !simulation || config?.paused || nodes.length === 0) return;
  if (simulation.alpha() <= simulation.alphaMin()) return;
  nextTickAt = performance.now() + TICK_INTERVAL_MS;
  tickTimer = setTimeout(tick, TICK_INTERVAL_MS);
}

function stopSimulation() {
  stopTicks();
  if (!simulation) return;
  simulation.on('tick', null).on('end', null).stop();
  simulation = null;
}

function initialize(message: Extract<GraphSimulationWorkerRequest, { type: 'initialize' }>) {
  stopSimulation();
  revision = message.revision;
  config = message.config;
  recycledPositionBuffers.length = 0;
  dragSequence = 0;

  nodes = message.nodes.map(node => ({ ...node }));
  nodeById = new Map(nodes.map(node => [node.id, node]));
  const links: WorkerLink[] = message.links.map(link => ({ ...link }));

  const gravityCenter = resolveGravityCenter(
    nodes,
    config.gravityCenterNodeIds,
    config.preserveScopeCentroid
  );
  const nextSimulation = forceSimulation<WorkerNode>(nodes).stop()
    .alphaDecay(config.alphaDecay).alphaMin(config.alphaMin)
    .velocityDecay(config.velocityDecay).alpha(config.initialAlpha ?? 1);
  applyPhysicsForces(nextSimulation, links, config, gravityCenter);

  simulation = nextSimulation;
  post({
    type: 'ready',
    protocolVersion: GRAPH_SIMULATION_PROTOCOL_VERSION,
    revision,
    nodeCount: nodes.length
  });
  publishPositions();
  startTicks();
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
        stopTicks();
      } else if (simulation.alpha() > simulation.alphaMin()) {
        startTicks();
      }
      return;
    case 'restart':
      if (!config?.paused) {
        simulation?.alpha(message.alpha);
        startTicks();
      }
      return;
    case 'drag-start': {
      const node = nodeById.get(message.nodeId);
      if (!node || !simulation) return;
      node.dragX = node.x;
      node.dragY = node.y;
      node.fx = node.x;
      node.fy = node.y;
      if (!config?.paused && message.alphaTarget > 0) {
        simulation.alpha(Math.max(simulation.alpha(), message.alphaTarget)).alphaTarget(message.alphaTarget);
        startTicks();
      }
      return;
    }
    case 'drag-move': {
      dragSequence = message.dragSequence;
      const node = nodeById.get(message.nodeId);
      if (!node || !simulation) return;
      node.fx = message.x;
      node.fy = message.y;
      node.x = message.x;
      node.y = message.y;
      if (!config?.paused && message.alphaTarget > 0) {
        simulation.alpha(Math.max(simulation.alpha(), message.alphaTarget)).alphaTarget(message.alphaTarget);
        startTicks();
      }
      publishPositions();
      return;
    }
    case 'drag-end': {
      dragSequence = message.dragSequence;
      const node = nodeById.get(message.nodeId);
      if (!node || !simulation) return;
      node.dragX = node.dragY = undefined;
      node.fx = null;
      node.fy = null;
      simulation.alphaTarget(0);
      publishPositions();
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
