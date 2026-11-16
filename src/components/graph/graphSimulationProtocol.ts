import type { GraphPhysicsProfile } from './types';
export const GRAPH_SIMULATION_PROTOCOL_VERSION = 2 as const;

export interface WorkerSimulationNodeInput {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size?: number;
  degree: number;
}

export interface WorkerSimulationLinkInput {
  source: string;
  target: string;
}

export interface WorkerSimulationConfig extends Pick<GraphPhysicsProfile, 'linkStrength' | 'degreeNormalizedLinks' | 'collisionStrength' | 'coolCollision' | 'chargeDistanceMin' | 'sizeBasedCollision' | 'centerFirst'> {
  forceScale: number;
  chargeStrength: number;
  linkDistance: number;
  nodeRadius: number;
  collisionRadius: number;
  gravityStrength: number;
  velocityDecay: number;
  alphaDecay: number;
  alphaMin: number;
  graphRefreshAlpha: number;
  initialAlpha?: number;
  preserveScopeCentroid: boolean;
  gravityCenterNodeIds: string[] | null;
  paused: boolean;
}

export type GraphSimulationWorkerRequest =
  | {
      type: 'initialize';
      protocolVersion: typeof GRAPH_SIMULATION_PROTOCOL_VERSION;
      revision: number;
      nodes: WorkerSimulationNodeInput[];
      links: WorkerSimulationLinkInput[];
      config: WorkerSimulationConfig;
    }
  | { type: 'set-paused'; revision: number; paused: boolean }
  | { type: 'restart'; revision: number; alpha: number }
  | { type: 'drag-start'; revision: number; nodeId: string; alphaTarget: number }
  | {
      type: 'drag-move';
      revision: number;
      nodeId: string;
      x: number;
      y: number;
      alphaTarget: number;
      dragSequence: number;
    }
  | { type: 'drag-end'; revision: number; nodeId: string; dragSequence: number }
  | { type: 'recycle'; revision: number; positions: ArrayBuffer }
  | { type: 'dispose'; revision: number };

export type GraphSimulationWorkerResponse =
  | {
      type: 'ready';
      protocolVersion: typeof GRAPH_SIMULATION_PROTOCOL_VERSION;
      revision: number;
      nodeCount: number;
    }
  | {
      type: 'tick';
      revision: number;
      alpha: number;
      dragSequence: number;
      positions: ArrayBuffer;
    }
  | { type: 'settled'; revision: number; alpha: number }
  | { type: 'error'; revision: number; message: string; stack?: string };

export function isGraphSimulationWorkerResponse(
  value: unknown
): value is GraphSimulationWorkerResponse {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<GraphSimulationWorkerResponse>;
  if (typeof candidate.type !== 'string' || typeof candidate.revision !== 'number') {
    return false;
  }

  switch (candidate.type) {
    case 'ready':
      return candidate.protocolVersion === GRAPH_SIMULATION_PROTOCOL_VERSION &&
        typeof candidate.nodeCount === 'number';
    case 'tick':
      return typeof candidate.alpha === 'number' &&
        typeof candidate.dragSequence === 'number' && candidate.positions instanceof ArrayBuffer;
    case 'settled':
      return typeof candidate.alpha === 'number';
    case 'error':
      return typeof candidate.message === 'string';
    default:
      return false;
  }
}

export function unpackWorkerPositions(
  positions: ArrayBuffer,
  expectedNodeCount: number
): Float32Array | null {
  if (positions.byteLength !== expectedNodeCount * 2 * Float32Array.BYTES_PER_ELEMENT) {
    return null;
  }

  return new Float32Array(positions);
}
