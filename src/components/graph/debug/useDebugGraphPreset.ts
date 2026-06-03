import { useMemo, useState } from 'react';
import type { GraphPreset, GraphTheme } from '../types';
import { debugPresets, type DebugPresetConfig } from './mockGraphPresets';

export function useDebugGraphPreset(localDepth: number) {
  const [selectedDebugBgId, setSelectedDebugBgId] = useState<string>('default-dark');
  const [labelDensity, setLabelDensity] = useState<number>(0.65);
  const [nodeSizeScale, setNodeSizeScale] = useState<number>(1.0);
  const [linkDistance, setLinkDistance] = useState<number>(45);
  const [chargeStrength, setChargeStrength] = useState<number>(-55);
  const [collisionRadius, setCollisionRadius] = useState<number>(8);
  const [velocityDecay, setVelocityDecay] = useState<number>(0.4);
  const [dimmingStrength, setDimmingStrength] = useState<number>(0.15);

  const activeDebugPreset = useMemo<DebugPresetConfig>(() => {
    return debugPresets.find(p => p.id === selectedDebugBgId) || debugPresets[0]!;
  }, [selectedDebugBgId]);

  const finalPreset = useMemo<GraphPreset>(() => {
    const basePreset = activeDebugPreset.preset;
    return {
      nodeRadius: basePreset.nodeRadius ?? 4.5,
      linkDistance,
      chargeStrength,
      collisionRadius,
      labelDensity,
      hoverDimming: Math.min(0.95, dimmingStrength * 1.5),
      selectionDimming: dimmingStrength,
      localGraphDepthBehavior: localDepth,
      nodeSizeScale,
      gravityStrength: 0.12,
      velocityDecay
    };
  }, [activeDebugPreset, labelDensity, nodeSizeScale, linkDistance, chargeStrength, collisionRadius, velocityDecay, dimmingStrength, localDepth]);

  const finalTheme = useMemo<Partial<GraphTheme>>(() => {
    return activeDebugPreset.theme;
  }, [activeDebugPreset]);

  return {
    debugPresets,
    selectedDebugBgId,
    setSelectedDebugBgId,
    activeDebugPreset,
    labelDensity,
    setLabelDensity,
    nodeSizeScale,
    setNodeSizeScale,
    linkDistance,
    setLinkDistance,
    chargeStrength,
    setChargeStrength,
    collisionRadius,
    setCollisionRadius,
    velocityDecay,
    setVelocityDecay,
    dimmingStrength,
    setDimmingStrength,
    finalPreset,
    finalTheme
  };
}
