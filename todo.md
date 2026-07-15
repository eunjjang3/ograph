# Goal: Obsidian-style graph runtime, harness first

## Objective

Rebuild Ograph's internal runtime around the same performance principles used by
Obsidian Graph while preserving the existing public React API, graph behavior,
and consumer compatibility. Prove the architecture in the debug harness before
the production `GraphView` default changes.

Worktree: `/Users/eun/Documents/ograph-obsidian-graph-spike`

Branch: `feat/obsidian-graph-harness-spike`

Base: `main` at `2d4bdb209df07df08f83a3d1cb100ec5da5bdbf0`

## Non-negotiable invariants

- Keep the runtime exports from `src/components/graph/index.ts` unchanged.
- Keep `GraphViewProps`, `GraphViewRef`, callback payloads, and generic metadata
  behavior unchanged.
- Do not expose PixiJS, worker protocol types, renderer selection, or simulation
  selection in the public package API.
- Keep exactly one consumer-visible graph canvas and retain the current inline
  container/canvas sizing contract.
- Preserve global/local mode, growth animation, camera focus, pause, reduced
  motion, hover, click, double-click, drag, wheel/pinch zoom, pointer-loss
  cleanup, and `onError` semantics.
- Keep the current Canvas 2D path available until the Pixi/Worker combination
  passes the full compatibility and performance gates.
- Do not update existing consumer screenshot baselines merely to make the spike
  pass. A visual baseline change requires an explicit promotion decision.
- Do not use `@pixi/react`; use imperative Pixi core so React 18 and React 19
  compatibility stays under Ograph's control.
- Use WebGL for the first Pixi lane. WebGPU, custom shaders, WASM simulation,
  and `SharedArrayBuffer` are follow-up optimizations, not prerequisites for the
  first result.
- Keep pointer semantics and the existing spatial-index hit test on the main
  thread for the first Pixi lane. Do not couple public interactions to Pixi's
  event traversal during the spike.
- Do not push, merge, or switch the production default as part of the harness
  spike without a separate explicit decision.

## Architecture thesis

The spike must test the Obsidian architecture as a system, not treat PixiJS as
a drop-in replacement for `canvasRenderer.ts`:

1. Force calculation moves off the main thread and returns packed positions.
2. Rendering becomes retained-mode: geometry is created once and frames update
   transforms, tint, alpha, and visibility.
3. Links use a reusable white texture sprite stretched and rotated between
   endpoints; they are not rebuilt as dynamic `Graphics` paths every frame.
4. Pixi's ticker stays disabled. Ograph's dirty-frame scheduler renders only
   while simulation results, input, viewport easing, or visual transitions are
   active.
5. Node/label materialization is budgeted across frames and prioritized around
   the current viewport.
6. Offscreen nodes, links, and labels are hidden before render submission, and
   label creation/paint remains bounded during interaction.

## Harness experiment matrix

The debug harness gets an internal-only runtime selector with four lanes:

| Renderer | Simulation | Purpose |
| --- | --- | --- |
| Canvas 2D | Main thread | Current baseline |
| Canvas 2D | Worker | Isolate simulation offload benefit |
| Pixi WebGL | Main thread | Isolate retained/GPU rendering benefit |
| Pixi WebGL | Worker | Target Obsidian-style runtime |

Use deterministic fixtures for `1,000`, `5,000`, and `10,000` nodes at average
degree `3.5`, fixed seed `42`, the default theme, and a recorded viewport/DPR.
Measure each lane during initial settling, force reheat, settled pan/zoom,
hover/focus, and node drag.

Harness telemetry must distinguish:

- requestAnimationFrame FPS plus p50/p95 frame interval,
- graph render CPU time and long frames over 16.7ms/33.3ms,
- simulation update rate and age of the latest worker result,
- visible and materialized nodes, links, and labels,
- topology-sync duration and first-visible-frame latency,
- main-thread versus worker simulation mode,
- Canvas versus Pixi renderer mode.

Provisional acceptance targets, to be recalibrated only from recorded evidence:

- 5k active/reheated graph: at least 45 FPS and p95 frame interval at most 25ms.
- 5k settled pan/zoom: at least 55 FPS with no interaction stall over 50ms.
- 10k active/reheated graph: at least 30 FPS.
- First visible graph content: within 250ms on the reference desktop run.
- No public API, interaction, lifecycle, or consumer-package regression.
- Record the final consumer bundle delta separately from Ograph's current
  `dist/index.js` package budget.

## Stages

- [x] Stage 1: Lock the baseline and add debug-only performance telemetry
  - Branch: `feat/obsidian-graph-harness-spike`
  - Likely files: `src/components/graph/debug/*`, `docs/debug-harness.md`,
    targeted graph-logic tests
  - Deliverable: deterministic A/B run definition and p50/p95/long-frame
    telemetry without changing production rendering
  - Verification: `npm run lint`, `npm run test`, targeted harness browser run
  - Docs: `docs/debug-harness.md`
  - Commit: `b45c8a2`

- [x] Stage 2: Introduce private renderer/simulation seams with baseline parity
  - Branch: `feat/obsidian-graph-harness-spike`
  - Likely files: `GraphView.tsx`, `useGraphRenderLoop.ts`,
    `useGraphSimulation.ts`, new internal runtime/backend modules, debug harness
  - Deliverable: private runtime seam and telemetry; the public `GraphView`
    remains wired to Canvas 2D plus main-thread simulation. The selector is
    enabled as the experimental lanes land in Stages 3 and 4.
  - Verification: API-surface tests, graph-logic tests, packed React 18/19
    consumer compilation, current browser interaction/visual suite
  - Docs: `docs/architecture.md`, `docs/debug-harness.md`
  - Commit: `58aae4d`

- [x] Stage 3: Add a Worker simulation lane to the debug harness
  - Branch: `feat/obsidian-graph-harness-spike`
  - Likely files: new simulation worker, worker protocol/adapter, simulation
    integration, debug telemetry, unit tests
  - Protocol: graph revision, packed node IDs/positions, topology, force config,
    pause/restart, drag pin updates, transferable `Float32Array` position frames,
    error/dispose messages
  - Deliverable: Canvas/Main versus Canvas/Worker comparison with layout and
    interaction parity. Start with d3-force in the worker; add an optional
    `SharedArrayBuffer` fast path only after transferable buffers are correct.
  - Verification: protocol tests, pause/restart/drag/unmount tests, 1k/5k/10k
    harness runs, `npm run lint`, `npm run test`
  - Docs: worker lifecycle and packaging notes in `docs/architecture.md`
  - Commit: `c07c0b3`

- [x] Stage 4: Add a Pixi WebGL renderer lane to the debug harness
  - Branch: `feat/obsidian-graph-harness-spike`
  - Likely files: `package.json`, lockfile, private renderer backend modules,
    `GraphView.tsx`, debug controls/telemetry
  - Renderer design: existing canvas passed to an asynchronously initialized
    Pixi Application, `autoStart: false`, retained node geometry, white-texture
    link sprites, retained/lazy text, current viewport transform and hit test
  - Deliverable: Canvas/Main versus Pixi/Main comparison without changing the
    public or production-default path
  - Verification: StrictMode init/destroy race, resize/DPR, context failure,
    screenshot comparison, all pointer interactions, 1k/5k/10k harness runs
  - Docs: renderer lifecycle and fallback notes in `docs/architecture.md`
  - Commit: `259aa89`

- [x] Stage 5: Add Obsidian-style work avoidance to the Pixi lane
  - Branch: `feat/obsidian-graph-harness-spike`
  - Likely files: Pixi backend, frame scheduler, spatial-index/culling helpers,
    debug telemetry
  - Deliverable: viewport-prioritized node/label materialization budget,
    endpoint-gated link materialization, offscreen visibility culling, bounded
    label objects, and fully idle render-loop shutdown
  - Verification: cold-load/first-frame metrics, pan into unmaterialized areas,
    zoom label transitions, memory/object-count telemetry, 10k stress run
  - Docs: `docs/architecture.md`, `docs/debug-harness.md`
  - Commit: `e357f52`

- [x] Stage 6: Run the four-lane acceptance comparison and make a promotion decision
  - Branch: `feat/obsidian-graph-harness-spike`
  - Deliverable: recorded results for all fixtures/phases, visual diffs,
    consumer bundle delta, lifecycle failures, and a written go/no-go decision
  - Verification: `npm run lint`, `npm run test`, `npm run build`,
    `npm run check:examples`, `npm run verify:consumer:pinned`,
    `npm run verify:consumer:floating`, `npm run test:browser`, package budget
  - Docs: results and decision appended to this file plus relevant architecture
    and debug-harness documentation
  - Decision: conditional go for Pixi/Worker as a future promotion candidate;
    no-go for immediate production-default promotion on this branch
  - Commit: `8986ad3`

- [ ] Stage 7: Promote the accepted runtime behind the existing public API
  - Branch: separate follow-up branch after explicit approval
  - Preconditions: Stage 6 accepts Pixi/Worker and approves its visual and
    bundle-cost tradeoffs
  - Deliverable: production default selection, transparent Canvas fallback on
    WebGL/init failure, packaged worker asset strategy, release notes, and
    updated browser baselines only after explicit visual approval
  - Verification: full stable release gate plus WebGL failure/fallback coverage
  - Docs: API wording remains renderer-neutral; architecture, changelog, and
    release notes document the internal runtime change
  - Commit: `<pending>`

## Human UX checkpoint (2026-07-15)

This was the intentional pause point requested for human feedback. At the time
of capture, Stage 6 remained unchecked until the visual/interaction tradeoffs
below were reviewed. Production defaults, public types, screenshot baselines,
and package dependencies were not promoted.

Representative single-pass measurements from the in-app Chromium browser at
`http://127.0.0.1:4435`, using 5,000 nodes, average degree `3.5`, seed `42`, and
the default theme:

| Renderer | Simulation | Active FPS | rAF p95 | Last graph draw CPU | First visible |
| --- | --- | ---: | ---: | ---: | ---: |
| Canvas 2D | Main | 28 | 50.2ms | 6.1ms | 91.6ms |
| Canvas 2D | Worker | 60 | 17.3ms | 4.9ms | 57.7ms |
| Pixi WebGL | Main, forced reheat | 26 | 50.0ms | 11.3ms | 330.8ms cold lane switch |
| Pixi WebGL | Worker | 60 | 17.6ms | 8.5ms | 100.2ms retained fixture switch |

The target Pixi/Worker lane at 10,000 nodes measured `56 FPS`, `33.1ms` rAF
p95, `14.1ms` last graph draw CPU, and `108.3ms` to first visible content after
a retained fixture switch. It therefore clears the provisional 5k and 10k FPS
targets in this run. Cold Canvas-to-Pixi context creation remains materially
slower than retained Pixi fixture/simulation changes and must be evaluated
separately before promotion.

Additional evidence:

- exactly one HTML canvas remained mounted in every lane;
- a Pixi/Worker canvas click resolved hover and selection through the existing
  Ograph spatial index (`node-3093` in the sampled 5k run);
- after settling, Pixi/Worker reported `Simulation State: idle` and
  `Frame Reasons: idle`; `Graph Draws` stayed at `450` across a two-second
  sample, confirming complete dirty-loop shutdown;
- all 72 unit/API/budget tests and all 8 packed-consumer browser tests passed;
- the production entry remained Canvas/Main with only the original runtime
  exports; `dist/index.js` measured about `16.80kB` gzip against the existing
  `16.94kB` limit and contains no Pixi/Worker runtime string or asset;
- Pixi stays a development dependency. The demo emits the experimental Pixi
  and Worker chunks; the packed consumer tarball contains no such runtime asset
  and installing the package does not install Pixi as a consumer dependency.

Questions presented for human review at the checkpoint:

1. Whether the Pixi node/link weight, color blending, focus borders, and
   screen-space labels are visually close enough to the Canvas contract.
2. Whether the 600 idle / 280 focused visible-label caps produce the desired
   Obsidian-like density, especially for CJK and long labels.
3. Whether cold WebGL initialization should be hidden by eager initialization,
   kept as an opt-in warm-up, or covered by a Canvas-first fallback during a
   future production promotion.
4. Whether the demo-only Pixi chunk and eventual dependency cost are acceptable
   before designing the packaged Worker asset and WebGL failure fallback.

These measurements were diagnostic evidence, not a stable benchmark artifact.
The follow-up below repeated the acceptance run before Stage 6 was checked.

## Stage 6 acceptance follow-up (2026-07-16)

Human review reported no major visual or interaction problem in the checkpoint.
The follow-up in-app-browser E2E exercised all four runtime lanes at 5,000
nodes, then covered the target Pixi/Worker lane at 10,000 nodes and through
hover, selection, anchored zoom, background pan, node drag/release,
double-click local focus, local idle, and global restoration. Every lane kept
exactly one canvas and reached sustained `Simulation State: idle` / `Frame
Reasons: idle` after active work.

The E2E found one real lifecycle failure before acceptance: the lazy Pixi
wrapper exposed its concrete backend while `Application.init()` was still in
flight, so an early frame could call `renderer.resize` before Pixi installed the
renderer. Commit `8986ad3` defers delegation until initialization resolves and
adds a readiness regression test. The exact failing Canvas/Worker -> Main ->
Pixi transition then settled without console errors.

Representative follow-up samples:

| Fixture and viewport | Lane | Sampled FPS | rAF p95 | Last graph draw CPU |
| --- | --- | ---: | ---: | ---: |
| 5,000 nodes, `0.80x` | Pixi/Worker | 60 | 17.4ms | 8.6ms |
| 10,000 nodes, natural `0.26x` auto-fit | Pixi/Worker | 60 | 16.8ms | 13.0ms |
| 10,000 nodes, full-view `0.10x` | Pixi/Worker | 23 | 50.1ms | 31.5ms |

The 5k row is the final settled page-level rAF sample; `Graph Draws` remained
unchanged after it entered `idle`. The two 10k rows are active-simulation
samples after Pixi materialization completed.

The `0.10x` result deliberately keeps all 10,000 nodes and 17,500 links in the
viewport and remains a known optimization target. The normal culled 10k view
meets the provisional target, but immediate production promotion remains a
no-go until a separate branch adds WebGL failure fallback, packaged Worker
assets, a cold-initialization policy, and explicit handling of the full-view
cost. Stage 7 therefore remains unchecked and requires explicit approval.

The completed gate passed `npm run lint`, `npm run test`, `npm run build`,
`npm run check:examples`, both pinned and floating React 18/19 consumer lanes,
`npm run test:browser`, and the package budget. The public entry still exports
only `GraphView`, `defaultGraphPreset`, and `defaultGraphTheme`; Pixi remains a
debug-only development dependency and no Pixi/Worker marker appears in the
published entry.

## Post-acceptance 10k optimization follow-up (2026-07-16)

The original full-view result above was treated as a profiling baseline rather
than a structural limit. Subsequent isolated commits removed settled-loop and
allocation waste, batched links and nodes with Pixi particles, reused views
across equivalent graph objects, and preserved unfinished materialization work
through the input-to-Worker object handoff. No public prop, ref, callback,
interaction path, screenshot baseline, or production runtime default changed.

Final fixed-seed evidence for Pixi/Worker with all 10,000 nodes and 17,500 links
inside the `0.07x` fitted viewport:

| Phase | FPS | rAF p95 | Last graph draw CPU |
| --- | ---: | ---: | ---: |
| Active/reheated repeat runs | 59-60 | 16.7-17.6ms | 8.4-11.2ms |
| Final idle review state | 60 | 16.8-17.4ms | 8.8-9.1ms |

Cold materialization improved from `1.51-1.60s` / `53-55` graph draws to
`1.03-1.08s` / `41-43` graph draws. Materialized node and link counts remained
monotonic through the Worker handoff. A remaining occasional initial `50ms`
frame is the sum of mock generation, normalization, topology signature/index,
spatial-index, and first planning work; attempts to optimize link queue
rotation, per-item particle registration, or only the planning comparator did
not improve the browser-level result and were reverted.

The final browser review retained exactly one canvas, default-theme visual
parity, hover/selection, local/global restoration, and zero console errors.
The full-view renderer-cost prerequisite is therefore cleared for the harness
spike. Stage 7 remains intentionally unchecked because Canvas fallback,
packaged Worker assets, cold-start UX policy, and production-default promotion
still require a separate explicit decision.

## Goal: Active-work telemetry and no-UX optimization follow-up

- [x] Stage 8: Make frame and graph-draw telemetry internally consistent
  - Branch: `feat/obsidian-graph-harness-spike`
  - Verification: `npm run lint && npm run test`
  - Docs: `docs/debug-harness.md`
  - Commit: `53268da`
- [x] Stage 9: Profile the fixed 10k Pixi/Worker active window and remove one low-risk hot-path waste
  - Branch: `feat/obsidian-graph-harness-spike`
  - Verification: fixed-seed 10k browser A/B plus targeted unit tests
  - Docs: `docs/debug-harness.md`, `docs/architecture.md`
  - Commit: `b69ab71`
- [x] Stage 10: Prove public API, visual, interaction, package, and consumer compatibility
  - Branch: `feat/obsidian-graph-harness-spike`
  - Verification: full repository and packed-consumer gate
  - Docs: `todo.md`, relevant architecture/debug notes
  - Commit: `1dea656`

The graph surface, controls, pointer behavior, public props/refs/callbacks, and
production Canvas/Main default are frozen for this follow-up. New measurements
must remain debug-only and visually inert. Optimization candidates are retained
only when the same active-work window improves without changing graph output or
interaction semantics.

Stage 8 fixed the resumed-tab window mismatch and added invisible active-draw
and renderer-phase attributes. In the fixed 10,000-node / 17,500-link full-view
Pixi/Worker baseline, six active windows measured `60.0-60.1` graph draws/s,
`17.1-17.5ms` draw-interval p95, `9.3-9.7ms` full-frame CPU p50,
`10.6-11.1ms` full-frame CPU p95, and `11.2-12.4ms` max. Last-frame phase
samples attributed roughly `1.0-1.3ms` to spatial-index rebuild, `1.8-2.3ms`
to Pixi culling/visible-ID preparation, `2.1-2.3ms` to links, `2.3-2.9ms` to
nodes, and `1.1-1.4ms` to Pixi command submission.

Stage 9 retained one exact full-containment fast path. A Pixi-only scan first
proves that every finite topology node is inside the padded viewport; only then
does Pixi bypass the grid query, temporary visible-ID set, and link clipping
tests. Six same-sequence post-change windows kept `60.0` graph draws/s while
full-frame CPU p50 fell to `7.6-7.7ms`, p95 to `8.0-8.3ms`, and max to
`8.1-8.8ms`. Pixi culling preparation fell from `1.8-2.3ms` to `0.0-0.1ms`.
The local-lens browser check retained 20 visible nodes / 19 visible links over
the existing 77-node / 81-link simulated halo, and invalid or partial
viewports remain on the old path. An intermediate shared-index extent design
was rejected because it exceeded the consumer gzip budget; the retained
Pixi-only implementation restores the `16,881` byte package result.

Stage 10 passed `npm run lint`, `npm test`, `npm run build`,
`npm run check:examples`, pinned and floating React 18/19 packed-consumer
verification, and all 8 Chromium packed-consumer tests. A clean in-app-browser
tab mounted exactly one Pixi canvas, materialized 10,000 nodes / 17,500 links,
reached `idle`, held its graph-draw count at `1335`, and reported zero console
errors. Manual Pixi interaction checks retained hover/selection, double-click
local focus, local drag updates, selection clearing, and global restoration.
The built runtime exports remain exactly `GraphView`, `defaultGraphPreset`, and
`defaultGraphTheme`; package gzip is `16,881` bytes, the production default is
still Canvas 2D/Main, and no push or production promotion was performed.

## Stop conditions

Stop the spike and report rather than silently widening scope when:

- public callback/ref behavior cannot be preserved without a public API change,
- worker packaging cannot work in both Vite demo and packed React consumers,
- Pixi needs a second consumer-visible canvas,
- 5k performance misses the target after Worker plus retained rendering,
- visual parity requires dropping arbitrary CSS colors/fonts or CJK labels,
- the consumer bundle/runtime cost is not acceptable,
- WebGL fallback changes error, accessibility, or lifecycle semantics.
