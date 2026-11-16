import { useMemo, useState } from 'react';
import type { GraphPreset, GraphTheme, GraphPhysicsPresetName } from '../types';
import { graphPhysicsPresets } from '../presets';
import { debugPresets, type DebugPresetConfig } from './mockGraphPresets';

export function useDebugGraphPreset(localDepth: number) {
  const [selectedDebugBgId, setSelectedDebugBgId] = useState<string>('default-dark');
  const [labelDensity, setLabelDensity] = useState<number>(0.65);
  const [nodeSizeScale, setNodeSizeScale] = useState<number>(1.0);
  const [linkOverride, setLinkDistance] = useState<number | undefined>();
  const [chargeOverride, setChargeStrength] = useState<number | undefined>();
  const [collisionOverride, setCollisionRadius] = useState<number | undefined>();
  const [physicsPreset, setPhysicsPreset] = useState<GraphPhysicsPresetName>('obsidian');
  const [velocityOverride, setVelocityDecay] = useState<number | undefined>();
  const profile = graphPhysicsPresets[physicsPreset];
  const linkDistance = linkOverride ?? profile.linkDistance;
  const chargeStrength = chargeOverride ?? profile.chargeStrength;
  const collisionRadius = collisionOverride ?? profile.collisionRadius;
  const velocityDecay = velocityOverride ?? graphPhysicsPresets[physicsPreset].velocityDecay;
  const selectPhysicsPreset = (name: GraphPhysicsPresetName) => {
    setPhysicsPreset(name);
    setVelocityDecay(undefined);
    setLinkDistance(undefined);
    setChargeStrength(undefined);
    setCollisionRadius(undefined);
  };
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
      physicsPreset,
      velocityDecay
    };
  }, [activeDebugPreset, labelDensity, nodeSizeScale, linkDistance, chargeStrength, collisionRadius, velocityDecay, physicsPreset, dimmingStrength, localDepth]);

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
    physicsPreset,
    selectPhysicsPreset,
    velocityDecay,
    setVelocityDecay,
    dimmingStrength,
    setDimmingStrength,
    finalPreset,
    finalTheme
  };
}
