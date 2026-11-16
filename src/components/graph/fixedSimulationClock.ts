import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

/** Keep fallback physics at 60 steps/s even on 120/144Hz displays. */
export function withFixedSimulationClock<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N>>(simulation: Simulation<N, L>) {
  simulation.stop();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let next = 0;
  let running = false;
  const interval = 1000 / 60;
  const tick = () => {
    timer = null;
    if (!running) return;
    simulation.tick();
    simulation.on('tick')?.call(simulation);
    if (!running) return;
    if (simulation.alpha() <= simulation.alphaMin()) {
      running = false;
      simulation.on('end')?.call(simulation);
      return;
    }
    next = Math.max(next + interval, performance.now());
    timer = setTimeout(tick, Math.max(0, next - performance.now()));
  };
  simulation.restart = () => {
    if (!running) {
      running = true;
      next = performance.now() + interval;
      timer = setTimeout(tick, interval);
    }
    return simulation;
  };
  simulation.stop = () => {
    running = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    return simulation;
  };
  return simulation;
}
