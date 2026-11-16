import type { GraphTheme, GraphPreset, GraphPhysicsProfile, GraphPhysicsPresetName } from './types';

/** Default dark canvas theme used when `GraphView` receives no theme override. */
export const defaultGraphTheme: GraphTheme = {
  backgroundColor: '#16161a',
  
  // Node colors for the default dark graph theme.
  nodeNoteColor: '#aaabb8',        // standard grey-purple
  nodeTagColor: '#6c5ce7',         // purple tag color
  nodeAttachmentColor: '#00b894',  // green attachment
  nodeUnresolvedColor: '#e17055',  // red/orange unresolved note
  nodeHubColor: '#fdcb6e',         // golden yellow
  nodeDefaultColor: '#95afc0',     // default slate node
  nodeSelectedColor: '#38bdf8',    // sky blue focus
  nodeHoverColor: '#ffffff',       // hover shine
  nodeRootColor: '#f43f5e',        // pink/rose root node
  nodeNeighborColor: '#38bdf8',    // connected highlight
  
  // Node outline borders
  nodeBorderColor: '#1e1e24',
  nodeBorderSelectedColor: '#38bdf8',
  
  // Link colors
  linkColor: 'rgba(255, 255, 255, 0.08)',
  linkHoverColor: 'rgba(56, 189, 248, 0.55)',
  linkSelectedColor: 'rgba(56, 189, 248, 0.55)',
  linkRootColor: 'rgba(244, 63, 94, 0.55)',
  linkNeighborColor: 'rgba(56, 189, 248, 0.3)',
  
  // Label colors
  labelColor: 'rgba(255, 255, 255, 0.45)',
  labelHoverColor: '#ffffff',
  labelSelectedColor: '#38bdf8',
  labelRootColor: '#f43f5e',
  
  fontFamily: '"Inter", system-ui, -apple-system, sans-serif'
};

/** Default force-layout and rendering preset used by `GraphView`. */
export const defaultGraphPreset: GraphPreset = {
  nodeRadius: 4.5,
  labelDensity: 0.6,
  hoverDimming: 0.25,
  selectionDimming: 0.15,
  localGraphDepthBehavior: 2,
  nodeSizeScale: 1.0,
  physicsPreset: 'obsidian'
};

/** Local reference configuration in world units scaled by 0.2. */
const referencePhysics: GraphPhysicsProfile = {
  linkDistance: 6, chargeStrength: -40, collisionRadius: 12,
  gravityStrength: 0.10739765264262631, chargeDistanceMin: 6,
  sizeBasedCollision: false, centerFirst: true, referenceHz: 51,
  velocityDecay: 0.4, alphaDecay: 1 - Math.pow(0.001, 1 / 300),
  dragAlpha: 0.3, reheatAlpha: 0.3, linkStrength: 0.07695316049124773,
  degreeNormalizedLinks: true, collisionStrength: 0.5, coolCollision: false
};

/** Behavior-inspired profiles; numeric overrides take precedence. */
export const graphPhysicsPresets: Readonly<Record<GraphPhysicsPresetName, Readonly<GraphPhysicsProfile>>> = {
  obsidian: referencePhysics,
  calm: { ...referencePhysics, velocityDecay: 0.55, alphaDecay: 0.03, dragAlpha: 0.16, reheatAlpha: 0.18, coolCollision: true },
  lively: { ...referencePhysics, velocityDecay: 0.3, alphaDecay: 0.018, dragAlpha: 0.4, reheatAlpha: 0.45, coolCollision: true },
  legacy: { ...referencePhysics, linkDistance: 45, chargeStrength: -50, collisionRadius: 8, gravityStrength: 0.1,
    chargeDistanceMin: 1, sizeBasedCollision: true, centerFirst: false, referenceHz: 60,
    reheatAlpha: 1, linkStrength: 0.85, degreeNormalizedLinks: false, collisionStrength: 0.9 }
};

export function resolveGraphPhysicsPreset(preset: Partial<GraphPreset>): GraphPhysicsProfile {
  const base = graphPhysicsPresets[preset.physicsPreset ?? 'obsidian'] ?? graphPhysicsPresets.obsidian;
  const bounded = (value: number | undefined, fallback: number, allowZero = true) =>
    value === undefined || !Number.isFinite(value) || (!allowZero && value <= 0)
      ? fallback : Math.max(0, Math.min(1, value));
  const finite = (value: number | undefined, fallback: number) =>
    value === undefined || !Number.isFinite(value) ? fallback : value;
  return {
    ...base,
    linkDistance: Math.max(0, finite(preset.linkDistance, base.linkDistance)),
    chargeStrength: finite(preset.chargeStrength, base.chargeStrength),
    collisionRadius: Math.max(0, finite(preset.collisionRadius, base.collisionRadius)),
    gravityStrength: Math.max(0, finite(preset.gravityStrength, base.gravityStrength)),
    velocityDecay: bounded(preset.velocityDecay, base.velocityDecay),
    alphaDecay: bounded(preset.alphaDecay, base.alphaDecay, false),
    dragAlpha: bounded(preset.dragAlpha, base.dragAlpha),
    reheatAlpha: bounded(preset.reheatAlpha, base.reheatAlpha, false)
  };
}
