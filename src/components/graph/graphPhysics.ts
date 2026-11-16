import { getNodeRadius } from './graphMath';
import { forceCollide, forceLink, forceManyBody, forceX, forceY, type Simulation, type Force, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import type { GraphPhysicsProfile } from './types';

/** Degree normalization keeps a hub's springs from fighting at full strength. */
export function createPhysicsLinkForce<N extends SimulationNodeDatum & { id: string }, L extends SimulationLinkDatum<N>>(
  distance: number, profile: Pick<GraphPhysicsProfile, 'linkStrength' | 'degreeNormalizedLinks'>
) {
  const force = forceLink<N, L>().id(node => node.id).distance(distance);
  const degreeStrength = force.strength();
  return force.strength(profile.degreeNormalizedLinks
    ? (link, index, links) => profile.linkStrength * degreeStrength(link, index, links)
    : profile.linkStrength);
}

/** d3 collision ignores alpha. Fade its corrections with the other forces. */
export function createPhysicsCollisionForce<N extends SimulationNodeDatum>(
  radius: (node: N) => number,
  profile: Pick<GraphPhysicsProfile, 'collisionStrength' | 'coolCollision'>
): Force<N, undefined> {
  const collision = forceCollide<N>().radius(radius);
  const force: Force<N, undefined> = alpha => {
    collision.strength(profile.collisionStrength * (profile.coolCollision ? Math.min(1, Math.max(0, alpha) / 0.3) : 1));
    collision(alpha);
  };
  force.initialize = (nodes, random) => collision.initialize(nodes, random);
  return force;
}

/** Convert a profile's reference steps to the fixed 60Hz integration clock. */
export function resolvePhysicsTiming(profile: Pick<GraphPhysicsProfile, 'referenceHz' | 'velocityDecay' | 'alphaDecay'>) {
  const h = profile.referenceHz / 60;
  const retention = 1 - profile.velocityDecay;
  const adjusted = retention ** h;
  return {
    alphaDecay: 1 - (1 - profile.alphaDecay) ** h,
    velocityDecay: 1 - adjusted,
    forceScale: h === 1 || retention === 0 ? 1 : retention === 1 ? h * h
      : h * (1 - adjusted) / adjusted * retention / (1 - retention)
  };
}


export type PhysicsForceConfig = Pick<GraphPhysicsProfile,
  'linkDistance' | 'chargeStrength' | 'collisionRadius' | 'gravityStrength' |
  'chargeDistanceMin' | 'sizeBasedCollision' | 'centerFirst' | 'linkStrength' |
  'degreeNormalizedLinks' | 'collisionStrength' | 'coolCollision'> & { nodeRadius: number; forceScale: number };
type PhysicsNode = SimulationNodeDatum & { id: string; size?: number; degree?: number; dragX?: number; dragY?: number };

export function createConfiguredCollision<N extends PhysicsNode>(config: PhysicsForceConfig) {
  return createPhysicsCollisionForce<N>(node => config.sizeBasedCollision
    ? getNodeRadius(config.nodeRadius, 1, node.size, node.degree) + config.collisionRadius
    : config.collisionRadius,
  { collisionStrength: config.collisionStrength * config.forceScale, coolCollision: config.coolCollision });
}

export function applyPhysicsForces<N extends PhysicsNode, L extends SimulationLinkDatum<N>>(
  simulation: Simulation<N, L>, links: L[], config: PhysicsForceConfig, center: { x: number; y: number }
) {
  const forces: Record<string, Force<N, L>> = {
    x: forceX<N>(center.x).strength(config.gravityStrength * 0.4),
    y: forceY<N>(center.y).strength(config.gravityStrength * 0.4),
    link: createPhysicsLinkForce<N, L>(config.linkDistance, config).links(links),
    charge: forceManyBody<N>().strength(config.chargeStrength).distanceMin(config.chargeDistanceMin),
    collide: createConfiguredCollision<N>(config)
  };
  // Pointer publication must not move the spring anchor a physics step early.
  for (const key of Object.keys(forces)) simulation.force(key, null);
  simulation.force('pin-input', null);
  if (config.centerFirst) simulation.force('pin-input', () => {
    for (const node of simulation.nodes()) {
      if (node.fx != null) { node.x = node.dragX ?? node.x; node.dragX = node.fx; }
      if (node.fy != null) { node.y = node.dragY ?? node.y; node.dragY = node.fy; }
    }
  });
  // Reinsert in physical order; replacing Map entries would preserve the old order.
  for (const key of config.centerFirst ? ['x', 'y', 'link', 'charge', 'collide'] : ['charge', 'link', 'collide', 'x', 'y']) {
    const force = forces[key]!;
    const scaled: Force<N, L> = alpha => force(alpha * config.forceScale);
    scaled.initialize = (nodes, random) => force.initialize?.(nodes, random);
    simulation.force(key, key === 'collide' ? force : scaled);
  }
  return simulation;
}
