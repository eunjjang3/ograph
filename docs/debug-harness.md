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

The internal-only runtime selector offers the complete two-by-two renderer and
simulation matrix. Switching a lane or deterministic fixture remounts the graph
canvas and resets runtime counters while keeping the public package API
unchanged. The harness warms the debug Pixi module in the background so lane
switch latency primarily measures WebGL initialization rather than chunk load.
Fixture and Main/Worker changes retain the active renderer context; changing
between Canvas 2D and Pixi WebGL replaces the canvas exactly once.

| Renderer | Simulation | Use |
| --- | --- | --- |
| `Canvas 2D` | `Main Thread` | Original baseline. |
| `Canvas 2D` | `Worker` | Isolates the benefit of moving d3-force off the main thread. |
| `Pixi WebGL` | `Main Thread` | Isolates retained/GPU rendering while retaining main-thread force cost. |
| `Pixi WebGL` | `Worker` | Target Obsidian-style lane. |

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
- simulation active/idle state and the frame reasons keeping dirty rendering awake,
- age of the latest Worker position result,
- topology sync duration and first-visible-frame latency,
- materialized and viewport-visible node/link/label object counts,
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

The page-level FPS value and its percentiles are derived from the same interval
set. A visibility transition resets the partial window, and a single interval
that spans a complete window is reported on its own instead of being mixed with
earlier 60 Hz samples. This prevents a resumed background tab from showing a
near-zero FPS beside an apparently healthy p95 from a different effective
window.

The existing telemetry card also carries visually inert debug data attributes
under `data-testid="runtime-performance-telemetry"`. They expose one-second
active graph-draw cadence, draw-interval p95, full graph-frame CPU p50/p95/max,
and the last Pixi phase breakdown. Active graph samples are collected only
while simulation, interaction animation, or renderer materialization actually
keeps drawing; idle page rAF callbacks are excluded. Full graph-frame CPU
includes pre-render spatial-index and label work, while the Pixi `submit`
phase still measures JavaScript command submission rather than GPU completion.
These attributes do not add controls, text, layout, or consumer API surface.

`Frame Reasons` is `idle` once force updates, viewport/focus/lens/label easing,
and Pixi materialization have all completed. At that point `Graph Draws` must
remain unchanged across subsequent telemetry samples even though the page-level
FPS counter continues sampling browser `requestAnimationFrame` cadence.

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

## Acceptance E2E (2026-07-16)

The post-feedback acceptance run used the in-app Chromium browser with average
degree `3.5`, seed `42`, and the default theme. Canvas/Main, Canvas/Worker,
Pixi/Main, and Pixi/Worker each mounted exactly one canvas, rendered the 5,000
node fixture, and reached sustained `Simulation State: idle` / `Frame Reasons:
idle` after active work completed.

The run found and fixed one lifecycle race: a render request could reach the
concrete Pixi backend before asynchronous `Application.init()` had installed
`app.renderer`. The lazy wrapper now delegates only after initialization and a
regression test covers the readiness boundary (`8986ad3`). Repeating the former
Canvas/Worker -> Main -> Pixi sequence produced no console error and settled
normally.

Pixi/Worker interaction coverage included node hover and selection, anchored
wheel zoom, background pan without node-drag events, node drag/release,
double-click local focus, local idle shutdown, and global restoration with the
selection cleared. The final settled 5,000-node target state showed the
page-level counter at `60 FPS` / `17.4ms` rAF p95 and retained an `8.6ms` last
graph-draw CPU sample at `0.80x`, with no further graph draws while idle.

At 10,000 nodes, the natural `0.26x` auto-fit viewport sampled `60 FPS`,
`16.8ms` rAF p95, and `13.0ms` last-draw CPU after materialization while the
Worker simulation was active. An intentionally wider `0.10x` view that placed
all 10,000 nodes and 17,500 links in the viewport sampled about `23 FPS`,
`50.1ms` rAF p95, and `31.5ms` last-draw CPU. That full-view case is a known
optimization target rather than evidence for the normal culled viewport. This
paragraph records the original acceptance baseline; the post-acceptance
follow-up below supersedes its full-view performance result.

The acceptance gate passed TypeScript, 72 unit/API/budget tests, the full demo
and library builds, examples, React 18/19 pinned and floating packed-consumer
verification, and all 8 packed-consumer Chromium tests. The decision is a
conditional go for Pixi/Worker as the experimental promotion candidate, not an
immediate production-default change. WebGL fallback, packaged Worker assets,
cold initialization UX, and explicit human approval remain prerequisites for a
separate promotion branch.

## Post-Acceptance 10k Optimization Follow-up (2026-07-16)

The same in-app Chromium harness was rerun after the retained Pixi hot path was
profiled one waste at a time. The accepted changes removed settled scans and
temporary collections, replaced link and node `Graphics` objects with retained
particle batches, reused views across equivalent topology objects, and carried
unfinished materialization queues across the input-to-Worker object handoff.
Experiments that did not improve the complete browser path were reverted rather
than retained.

With all 10,000 nodes and 17,500 links in the viewport at the final `0.07x`
fit, six active/reheated samples held `59-60 FPS`, `16.7-17.6ms` rAF p95, and
`8.4-11.2ms` last graph-draw CPU across repeat runs and a theme switch. The
final settled review state held `60 FPS` with no long frame above `33.3ms`,
exactly one canvas, and no browser console error. Theme changes retained all
10,000 node and 17,500 link views while remaining at `59-60 FPS`.

Fixed-sequence cold materialization runs improved from `1.51-1.60s` to
`1.03-1.08s`; the completion-window FPS median rose from `26` to `53`, and the
number of graph draws needed to finish fell from `53-55` to `41-43`. One
initial roughly `50ms` frame can still occur. Profiling attributes that frame
to the aggregate synchronous setup pipeline (deterministic mock generation,
input normalization, topology signature/index construction, spatial indexing,
and initial Pixi planning), not to a remaining dominant renderer loop.

Hover, selection, selected borders, local/global scope changes, theme changes,
and Worker-backed node movement continued to resolve through the existing
Ograph interaction path. The production build still exports only `GraphView`,
`defaultGraphPreset`, and `defaultGraphTheme`; Pixi/Worker selection remains
debug-only and the published default remains Canvas 2D/Main. Further reduction
of the cold setup frame would require asynchronous generation or staged
initialization, which is an explicit UX/promotion decision rather than another
no-UI-change renderer optimization.
