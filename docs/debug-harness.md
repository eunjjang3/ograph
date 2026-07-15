# Debug Harness

The local app is a Vite-powered stress-test harness for `GraphView`.

Run it with:

```sh
npm install
npm run dev
```

Then open the fixed debug URL at `http://localhost:4435`. The development
server uses strict port selection so a conflicting process fails loudly instead
of silently moving the comparison run to another port.

## Purpose

The harness exists to test graph rendering, force tuning, local/global mode behavior, interaction responsiveness, and visual themes without depending on a downstream app.

It is not part of the production package API. Consumers should not import anything from `src/components/graph/debug`.

## Files

| File | Responsibility |
| --- | --- |
| `GraphDebugHarness.tsx` | Full-screen debug layout, graph event wiring, render count, and graph viewport telemetry. |
| `DebugControlPanel.tsx` | Debug side-panel controls, preset selectors, command buttons, and telemetry readouts. |
| `useDebugGraphState.ts` | Generated graph data, local/global mode state, root selection, selected/hovered node state, and active element counts. |
| `useDebugGraphPreset.ts` | Debug preset selection, force/style slider state, and derived graph preset/theme values. |
| `useFpsCounter.ts` | Rolling requestAnimationFrame FPS, p50/p95 interval, and long-frame telemetry for repeatable stress comparisons. |
| `useDebugRuntimeTelemetry.ts` | Samples renderer, simulation, draw-duration, update-count, and materialization counters without putting hot-path state in React. |
| `generateMockGraphData.ts` | Deterministic graph generator for typed nodes, groups, attachments, unresolved references, hubs, communities, and links. |
| `mockGraphPresets.ts` | Debug-only visual theme and force preset options. |

## Controls

### Runtime Experiment Lane

The internal-only runtime selector currently offers Canvas 2D with either the
main-thread or Worker d3-force simulation. Switching simulation mode remounts
the graph canvas, resets runtime counters, and keeps the public package API
unchanged. The Pixi control remains disabled until the renderer stage lands.

| Renderer | Simulation | Use |
| --- | --- | --- |
| `Canvas 2D` | `Main Thread` | Original baseline. |
| `Canvas 2D` | `Worker` | Isolates the benefit of moving d3-force off the main thread. |

### Mock Generator Setup

| Control | Effect |
| --- | --- |
| `Seed Node Capacity` | Chooses generated node count: `100`, `500`, `1000`, `2500`, `5000`, or `10000`. |
| `Avg Links / Node` | Controls the target average degree. Total target link count is `nodeCount * avgLinksPerNode / 2`. |
| `Random Seed` | Regenerates deterministic graph data from a new seed. |

The generator is deterministic for the same node count, average links value, and seed.

### Interactive Scopes

| Control | Effect |
| --- | --- |
| `global` | Renders the complete generated graph. |
| `local` | Applies a breadth-first focus lens around the root node while retaining one hidden physics halo ring. |
| `Local Depth BFS Level` | Chooses local traversal depth from `1` to `4`. |
| `Focus Anchor Core` | Selects the local root node. |
| `Random Hub` | Picks a generated hub node as the local root. |

Double-clicking a node in the canvas also sets it as the root and switches into local mode. The double-click focus action clears the transient `Selected Node ID` readout, and switching back to global mode clears it again so root focus does not linger as a selected-node highlight.

### Preset Styles And Overrides

Debug presets combine partial theme overrides and partial force preset overrides.

Included debug presets:

- `Default Dark`
- `Neon Cyberpunk`
- `Warm Redwood`
- `Stellar Constellation`

Runtime sliders override the active preset:

| Control | Mapped Field |
| --- | --- |
| `Label Culling Limit` | `GraphPreset.labelDensity`; shifts the soft zoom/degree reveal band for non-focused label opacity |
| `Node Size Weight` | `GraphPreset.nodeSizeScale`; visual and hit-test size only, not physics |
| `Force Link Distance` | `GraphPreset.linkDistance` |
| `Node Charge (Repulsion)` | `GraphPreset.chargeStrength` |
| `Collision Boundary Buffer` | `GraphPreset.collisionRadius` |
| `Simulation Viscosity` | `GraphPreset.velocityDecay`; lower values keep motion floaty longer, higher values damp motion faster |
| `Neighborhood Contrast (Dim)` | `GraphPreset.selectionDimming` and derived `hoverDimming` |

### Control Diagnostics

`Node Size Weight` intentionally does not affect d3-force collision, charge, link distance, or simulation restart behavior. Use `Collision Boundary Buffer`, `Force Link Distance`, `Node Charge (Repulsion)`, and `Simulation Viscosity` when tuning layout physics.

| Button | Effect |
| --- | --- |
| `Re-heat Forces` | Calls `restartSimulation()` on the graph ref. |
| `Reset Zoom Scale` | Calls `fitToView()` on the graph ref. |

## Telemetry

The harness displays:

- estimated FPS,
- rolling p50 and p95 requestAnimationFrame interval,
- sampled frames over the 16.7ms and 33.3ms budgets,
- active private renderer and simulation lane,
- graph draw count and last graph draw CPU duration,
- simulation update count,
- age of the latest Worker position result,
- topology sync duration and first-visible-frame latency,
- materialized label count,
- current zoom multiplier,
- visible node and link counts,
- active simulated node and link counts, including the hidden local-lens halo,
- React render count,
- drag phase, dragged node ID, and drag event count,
- active drag alpha targets for drag start and drag movement,
- whether connected-neighbor wake is enabled for the current mode,
- hovered node ID,
- selected node ID.

`Hovered Node ID` and `Selected Node ID` are diagnostic state only. `Selected Node ID` should become `none` after changing the local root or returning to global mode; `Focus Anchor Core` is the separate local-lens root.

The drag telemetry is intentionally mode-sensitive. In global mode it reports the high-heat drag policy with connected-neighbor wake enabled. In local mode it reports the low-heat drag policy with connected-neighbor wake disabled, so local lens drags remain live in the d3 simulation without re-running the full global wake inside the scoped halo.

Frame telemetry is measured in one-second `requestAnimationFrame` windows. FPS,
p50/p95 intervals, and long-frame counts are useful for fixed-seed A/B
comparisons while tuning. They describe main-thread responsiveness rather than
the graph draw loop alone and are not a replacement for a browser performance
trace.

## Mock Data Shape

`generateMockGraphData(nodeCount, avgLinksPerNode, seed)` returns:

```ts
{
  nodes: GraphNode[];
  links: GraphLink[];
}
```

The generator creates:

- community centers arranged around the origin,
- node groups assigned to communities,
- default `note`, `tag`, `attachment`, `unresolved`, and `hub` node categories,
- hub links,
- tag links,
- mostly intra-community links with some cross-community bridge links,
- final degree values written to each node.

Approximate generated node type distribution:

| Type | Weight |
| --- | --- |
| `note` | `70%` |
| `tag` | `10%` |
| `attachment` | `8%` |
| `unresolved` | `8%` |
| `hub` | `4%` |

Attachments are skipped as primary source nodes during random link generation so they behave more like linked resources than graph hubs.

## Stress-Test Notes

The largest built-in size is 10,000 nodes. After the initial global layout stabilizes, useful checks are:

- simulation still appears and cools,
- pan and zoom remain responsive,
- hover hit testing still finds nearby nodes,
- hover clears when the pointer leaves a node or exits the canvas,
- labels do not dominate the canvas at low zoom and reveal gradually while crossing culling boundaries,
- hover and selection line highlights fade cleanly instead of holding stale full-strength focus,
- local mode fades into the focused neighborhood without abrupt node movement,
- local node drag keeps the simulation live at low heat while preserving the visible lens shape,
- sparse local mode cases at `Avg Links / Node` values near `1.5` or lower still zoom to the selected root neighborhood instead of sliding toward an unrelated origin,
- local mode reduces simulated node and link counts to the visible lens plus hidden halo,
- returning to global mode restores the previous global viewport,
- pan, zoom, and local transitions remain at or above roughly 30 FPS in the harness telemetry.

For repeatable visual or performance comparisons, keep `nodeCount`, `avgLinks`, `seed`, selected preset, and slider values fixed.
