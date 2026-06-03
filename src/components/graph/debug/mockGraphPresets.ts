import type { GraphTheme, GraphPreset } from '../types';

export interface DebugPresetConfig {
  id: string;
  name: string;
  theme: Partial<GraphTheme>;
  preset: Partial<GraphPreset>;
  description: string;
}

export const debugPresets: DebugPresetConfig[] = [
  {
    id: 'default-dark',
    name: 'Default Dark',
    description: 'The standard dark knowledge graph profile with subtle, semi-transparent links and clean gray-indigo tones.',
    theme: {}, // uses default values
    preset: {}
  },
  {
    id: 'neon-cyber',
    name: 'Neon Cyberpunk',
    description: 'Immersive terminal dashboard with high-contrast electric magenta, radioactive green, neon blue nodes, and dark navy canvas.',
    theme: {
      backgroundColor: '#0a0a14',
      nodeNoteColor: '#00f2fe',
      nodeTagColor: '#9b5de5',
      nodeAttachmentColor: '#f15bb5',
      nodeUnresolvedColor: '#e0a96d',
      nodeHubColor: '#fee440',
      nodeSelectedColor: '#00f2fe',
      nodeHoverColor: '#ffffff',
      nodeRootColor: '#ff007f',
      nodeNeighborColor: '#00f2fe',
      
      linkColor: 'rgba(0, 242, 254, 0.05)',
      linkHoverColor: 'rgba(255, 0, 127, 0.7)',
      linkSelectedColor: 'rgba(0, 242, 254, 0.7)',
      linkNeighborColor: 'rgba(0, 242, 254, 0.35)',
      
      labelColor: 'rgba(0, 242, 254, 0.45)',
      labelSelectedColor: '#00f2fe',
      labelHoverColor: '#ffffff',
      labelRootColor: '#ff007f',
      
      fontFamily: '"JetBrains Mono", Courier, monospace'
    },
    preset: {
      nodeRadius: 5.0,
      linkDistance: 50,
      chargeStrength: -60,
      collisionRadius: 9,
      labelDensity: 0.7
    }
  },
  {
    id: 'redwood',
    name: 'Warm Redwood',
    description: 'Cozy, organic forest color profile using natural cedar browns, warm terracotta highlight shades, and earthy sage backgrounds.',
    theme: {
      backgroundColor: '#1b1b16',
      nodeNoteColor: '#b4a68c',
      nodeTagColor: '#d69d7a',
      nodeAttachmentColor: '#8a9a86',
      nodeUnresolvedColor: '#cc7162',
      nodeHubColor: '#e0b034',
      nodeSelectedColor: '#cc7a5c',
      nodeHoverColor: '#fbf9f4',
      nodeRootColor: '#ee6c4d',
      nodeNeighborColor: '#e0b034',
      
      linkColor: 'rgba(180, 166, 140, 0.06)',
      linkHoverColor: 'rgba(238, 108, 77, 0.65)',
      linkSelectedColor: 'rgba(224, 176, 52, 0.65)',
      linkNeighborColor: 'rgba(180, 166, 140, 0.25)',
      
      labelColor: 'rgba(180, 166, 140, 0.5)',
      labelSelectedColor: '#cc7a5c',
      labelHoverColor: '#fbf9f4',
      labelRootColor: '#ee6c4d',
      
      fontFamily: 'serif, "Playfair Display", "Georgia"'
    },
    preset: {
      nodeRadius: 4.0,
      linkDistance: 40,
      chargeStrength: -40,
      collisionRadius: 6,
      labelDensity: 0.55
    }
  },
  {
    id: 'stellar-constellation',
    name: 'Stellar Constellation',
    description: 'Astronomy simulation aesthetics. Microscopic deep-space stars joined by starry cosmic line connections.',
    theme: {
      backgroundColor: '#020205',
      nodeNoteColor: '#ffffff',
      nodeTagColor: '#7a8ff0',
      nodeAttachmentColor: '#aee4ff',
      nodeUnresolvedColor: '#533c69',
      nodeHubColor: '#ffdf00',
      nodeSelectedColor: '#00d2ff',
      nodeHoverColor: '#ffffff',
      nodeRootColor: '#ff2d55',
      nodeNeighborColor: '#00d2ff',
      
      linkColor: 'rgba(255, 255, 255, 0.03)',
      linkHoverColor: 'rgba(255, 45, 85, 0.8)',
      linkSelectedColor: 'rgba(0, 210, 255, 0.8)',
      linkNeighborColor: 'rgba(0, 210, 255, 0.3)',
      
      labelColor: 'rgba(255, 255, 255, 0.3)',
      labelSelectedColor: '#00d2ff',
      labelHoverColor: '#ffffff',
      labelRootColor: '#ff2d55',
      
      fontFamily: 'system-ui, sans-serif'
    },
    preset: {
      nodeRadius: 2.2,
      linkDistance: 32,
      chargeStrength: -25,
      collisionRadius: 4,
      labelDensity: 0.8,
      nodeSizeScale: 0.85
    }
  }
];
