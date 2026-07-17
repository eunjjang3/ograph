import type { GraphLink, GraphNode } from './types';
import { buildGraphIndexes } from './graphIndexes';
import { getLinkId } from './localGraph';
import {
  GRAPH_SIMULATION_PROTOCOL_VERSION,
  isGraphSimulationWorkerResponse,
  unpackWorkerPositions,
  type GraphSimulationWorkerRequest,
  type WorkerSimulationConfig
} from './graphSimulationProtocol';

export interface WorkerGraphSnapshot {
  nodes: GraphNode[];
  adjacencyById: Map<string, Set<string>>;
  degreeById: Map<string, number>;
}

export interface WorkerGraphSimulationClientOptions {
  createWorker: () => Worker;
  revision: number;
  nodes: GraphNode[];
  links: GraphLink[];
  cachedPositions: Map<string, { x: number; y: number; vx: number; vy: number }>;
  config: WorkerSimulationConfig;
  onGraphReady: (snapshot: WorkerGraphSnapshot, topologySyncDurationMs: number) => void;
  onActiveChange: (active: boolean) => void;
  onTick: (receivedAt: number) => void;
  onReady: (readyAt: number) => void;
  onError: (error: Error) => void;
}

function toGraphError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}

export class WorkerGraphSimulationClient {
  private worker: Worker | null = null;
  private mappedNodes: GraphNode[] = [];
  private disposed = false;
  private latestAlpha = 1;
  private readonly options: WorkerGraphSimulationClientOptions;

  constructor(options: WorkerGraphSimulationClientOptions) {
    this.options = options;
  }

  start() {
    const topologyStartedAt = performance.now();
    const { adjacencyById, degreeById, validLinks } = buildGraphIndexes(
      this.options.nodes,
      this.options.links
    );

    this.mappedNodes = this.options.nodes.map(node => {
      const cached = this.options.cachedPositions.get(node.id);
      return {
        ...node,
        degree: degreeById.get(node.id) ?? 0,
        x: cached?.x ?? node.x ?? (Math.random() - 0.5) * 150,
        y: cached?.y ?? node.y ?? (Math.random() - 0.5) * 150,
        vx: cached?.vx ?? node.vx ?? 0,
        vy: cached?.vy ?? node.vy ?? 0
      };
    });

    this.options.onGraphReady(
      { nodes: this.mappedNodes, adjacencyById, degreeById },
      performance.now() - topologyStartedAt
    );

    const worker = this.options.createWorker();
    this.worker = worker;
    worker.onmessage = event => this.handleMessage(event.data);
    worker.onerror = event => {
      event.preventDefault();
      this.options.onError(new Error(event.message || 'Graph simulation worker failed.'));
    };
    worker.onmessageerror = () => {
      this.options.onError(new Error('Graph simulation worker returned an unreadable message.'));
    };

    const request: GraphSimulationWorkerRequest = {
      type: 'initialize',
      protocolVersion: GRAPH_SIMULATION_PROTOCOL_VERSION,
      revision: this.options.revision,
      nodes: this.mappedNodes.map(node => ({
        id: node.id,
        x: node.x ?? 0,
        y: node.y ?? 0,
        vx: node.vx ?? 0,
        vy: node.vy ?? 0,
        size: node.size,
        degree: node.degree ?? 0
      })),
      links: validLinks.map(link => ({
        source: getLinkId(link.source),
        target: getLinkId(link.target)
      })),
      config: this.options.config
    };

    worker.postMessage(request);
    this.options.onActiveChange(!this.options.config.paused && this.mappedNodes.length > 0);
  }

  private handleMessage(value: unknown) {
    if (this.disposed || !isGraphSimulationWorkerResponse(value)) return;
    if (value.revision !== this.options.revision) return;

    switch (value.type) {
      case 'ready':
        if (value.nodeCount !== this.mappedNodes.length) {
          this.options.onError(new Error(
            `Graph simulation worker node count mismatch: ${value.nodeCount} !== ${this.mappedNodes.length}`
          ));
          return;
        }
        this.options.onReady(performance.now());
        return;
      case 'tick': {
        const packed = unpackWorkerPositions(value.positions, this.mappedNodes.length);
        if (!packed) {
          this.options.onError(new Error('Graph simulation worker returned an invalid position buffer.'));
          return;
        }

        for (let index = 0; index < this.mappedNodes.length; index += 1) {
          const node = this.mappedNodes[index]!;
          node.x = packed[index * 2];
          node.y = packed[index * 2 + 1];
        }

        this.latestAlpha = value.alpha;
        const active = value.alpha > this.options.config.alphaMin && !this.options.config.paused;
        this.options.onActiveChange(active);
        this.options.onTick(performance.now());
        this.post({
          type: 'recycle',
          revision: this.options.revision,
          positions: value.positions
        }, [value.positions]);
        return;
      }
      case 'settled':
        this.latestAlpha = value.alpha;
        this.options.onActiveChange(false);
        this.options.onTick(performance.now());
        return;
      case 'error':
        this.options.onActiveChange(false);
        this.options.onError(Object.assign(new Error(value.message), { stack: value.stack }));
    }
  }

  private post(message: GraphSimulationWorkerRequest, transfer?: Transferable[]) {
    if (this.disposed || !this.worker) return;
    this.worker.postMessage(message, transfer ?? []);
  }

  setPaused(paused: boolean) {
    this.options.config.paused = paused;
    this.options.onActiveChange(
      !paused && this.mappedNodes.length > 0 && this.latestAlpha > this.options.config.alphaMin
    );
    this.post({ type: 'set-paused', revision: this.options.revision, paused });
  }

  restart(alpha = 1) {
    if (this.options.config.paused) return;
    this.latestAlpha = alpha;
    this.options.onActiveChange(true);
    this.post({ type: 'restart', revision: this.options.revision, alpha });
  }

  dragStart(nodeId: string, alphaTarget: number) {
    this.post({
      type: 'drag-start',
      revision: this.options.revision,
      nodeId,
      alphaTarget
    });
  }

  dragMove(
    nodeId: string,
    x: number,
    y: number,
    alphaTarget: number,
    wakeConnectedNodes: boolean
  ) {
    this.post({
      type: 'drag-move',
      revision: this.options.revision,
      nodeId,
      x,
      y,
      alphaTarget,
      wakeConnectedNodes
    });
  }

  dragEnd(nodeId: string) {
    this.post({ type: 'drag-end', revision: this.options.revision, nodeId });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.options.onActiveChange(false);

    for (const node of this.mappedNodes) {
      this.options.cachedPositions.set(node.id, {
        x: node.x ?? 0,
        y: node.y ?? 0,
        vx: node.vx ?? 0,
        vy: node.vy ?? 0
      });
    }

    if (this.worker) {
      this.worker.postMessage({ type: 'dispose', revision: this.options.revision });
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export function createWorkerGraphSimulationClient(
  options: WorkerGraphSimulationClientOptions
): WorkerGraphSimulationClient {
  try {
    return new WorkerGraphSimulationClient(options);
  } catch (caught) {
    throw toGraphError(caught);
  }
}
