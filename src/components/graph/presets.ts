import type { GraphTheme, GraphPreset } from './types';

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
  linkDistance: 45,
  chargeStrength: -50,
  collisionRadius: 8,
  labelDensity: 0.6,
  hoverDimming: 0.25,
  selectionDimming: 0.15,
  localGraphDepthBehavior: 2,
  gravityStrength: 0.1,
  nodeSizeScale: 1.0,
  velocityDecay: 0.4
};
