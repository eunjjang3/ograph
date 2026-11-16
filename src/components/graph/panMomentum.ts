import type { Viewport } from './graphMath';

/** Screen pixels per second, independent of zoom and display refresh rate. */
export interface PanVelocity { x: number; y: number }

const DECAY = -60 * Math.log(0.9);
const STOP_SPEED = 5;

export function advancePanMomentum(viewport: Viewport, velocity: PanVelocity, seconds: number) {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (!Number.isFinite(speed) || speed < STOP_SPEED || !Number.isFinite(seconds) || seconds <= 0) {
    return { viewport, velocity: { x: 0, y: 0 }, active: false };
  }
  const dt = Math.min(seconds, Math.log(speed / STOP_SPEED) / DECAY);
  const decay = Math.exp(-DECAY * dt);
  const distance = (1 - decay) / DECAY;
  const active = seconds < Math.log(speed / STOP_SPEED) / DECAY;
  return {
    viewport: { ...viewport, x: viewport.x + velocity.x * distance, y: viewport.y + velocity.y * distance },
    velocity: active ? { x: velocity.x * decay, y: velocity.y * decay } : { x: 0, y: 0 },
    active
  };
}
