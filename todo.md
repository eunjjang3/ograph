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

- [x] Stage 7: Promote the accepted runtime behind the existing public API
  - Worktree: `/Users/eun/Documents/ograph-pixi-worker-production`
  - Branch: `feat/pixi-worker-production-runtime`
  - Base: `main` at `f075f6c47df4ba90eef284ce7018510eb7530e99`
  - Preconditions: Stage 6 accepts Pixi/Worker and approves its visual and
    bundle-cost tradeoffs
  - Deliverable: production default selection, transparent Canvas fallback on
    WebGL/init failure, packaged worker asset strategy, release notes, and
    updated browser baselines only after explicit visual approval
  - Verification: full stable release gate plus WebGL failure/fallback coverage
  - Docs: API wording remains renderer-neutral; architecture, changelog, and
    release notes document the internal runtime change
  - Commit: `110a45a`
  - Pull request: https://github.com/eunjjang3/ograph/pull/48 (draft)

  - [x] Stage 7A: Lock production promotion and fallback invariants
    - Deliverable: renderer-neutral packed-browser pixel checks; regression
      coverage for WebGL and Worker construction failure; unchanged public
      runtime/type exports; exactly one consumer-visible canvas
    - Verification: targeted API/graph tests and packed-browser nonvisual tests
    - Docs: this plan
    - Commit: `110a45a`

  - [x] Stage 7B: Package the lazy Pixi renderer and simulation Worker
    - Deliverable: `pixi.js` runtime dependency, lazy renderer chunk, bundled
      module Worker asset, tarball inclusion rules, SSR-safe import, and package
      budgets split between the synchronous entry and lazy runtime assets
    - Verification: library build, tarball inventory, React 18/19 packed
      consumers, direct registry-style browser install
    - Docs: `docs/architecture.md`, `docs/debug-harness.md`
    - Commit: `110a45a`

  - [x] Stage 7C: Promote Pixi/Worker with automatic per-lane fallback
    - Deliverable: package-facing Pixi/Worker default; silent Pixi-to-Canvas
      canvas replacement on WebGL/init failure; Worker-to-main fallback on
      construction, protocol, or runtime failure; debug lane failures remain
      observable instead of silently changing the selected experiment
    - Verification: fallback unit tests, StrictMode cleanup, pause/restart/drag,
      one-canvas lifecycle, no consumer `onError` for a recovered environment
      limitation
    - Docs: `docs/architecture.md`, renderer-neutral `docs/api.md`
    - Commit: `110a45a`

  - [x] Stage 7D: Qualify cold start, visuals, interactions, and performance
    - Deliverable: background-only cold initialization with no spinner or
      public state; first-visible timing, 1k/5k/10k performance, packed visual
      diffs, and an explicit human UX checkpoint before baseline updates
    - Verification: full debug profiler plus packed Playwright interaction and
      visual suites
    - Docs: `docs/debug-harness.md`, this plan
    - Human UX approval: accepted as non-disruptive on 2026-07-18
    - Commit: `110a45a`

  - [x] Stage 7E: Integrate only after human approval
    - Deliverable: full stable release gate, final docs/changelog, pushed branch
      and checked PR; no merge, version bump, tag, or npm publish without a
      separate explicit approval
    - Verification: lint, tests, budgets, builds, examples, React 18/19 packed
      consumers, browser suite, package dry run, and release identity dry run
    - Docs: architecture, debug harness, changelog, this plan
    - Commit: `110a45a`
    - Pull request: https://github.com/eunjjang3/ograph/pull/48 (draft)

## Stage 7 production-promotion UX checkpoint (2026-07-18)

Work is isolated in `/Users/eun/Documents/ograph-pixi-worker-production` on
`feat/pixi-worker-production-runtime`, based on `main` at `f075f6c`. The prior
spike worktree `/Users/eun/Documents/ograph-obsidian-graph-spike` and its branch
remain clean and intentionally retained; neither was removed or reused.

The package-facing runtime now selects Pixi WebGL and Worker simulation through
private defaults while preserving the public props, ref methods, callbacks,
types, and three runtime exports. WebGL/init failure replaces the owned canvas
once with Canvas 2D, and Worker construction/protocol/runtime failure falls back
to main-thread simulation. Recovered environment failures remain silent to
consumer `onError`; the debug harness disables fallback so its selected lane
continues to be an observable experiment.

The library package publishes package-relative lazy chunks and a module Worker.
`pixi.js@8.19.0` is an exact runtime dependency and remains external to Ograph's
own chunks. Gzip budgets are split into the `17,042`-byte synchronous entry,
`9,138`-byte lazy-chunk aggregate, and `6,899`-byte Worker baseline, each with a
10% release guard. The packed tarball contains 21 allowlisted files and the
runtime exports remain exactly `GraphView`, `defaultGraphPreset`, and
`defaultGraphTheme`.

The selectable profiler produced these fixed-seed, real-GPU results:

| Nodes | Complete materialization | First visible | Steady FPS | Graph CPU p95 | Cold long-task max |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | already materialized sample | 16.1ms | 60 | 2.2ms | not sampled |
| 5,000 | 686-713ms | 44.2-45.8ms | 60 | 5.1-5.5ms | 56-58ms |
| 10,000 | 1,230-1,246ms | 63.2-66.2ms | 60 | 7.8-8.0ms | 91-94ms |

The 5k run exposed a quadratic `pendingLinks.shift()` queue. In-place
compaction reduced complete materialization from `1,188-1,193ms` to
`686-713ms` and the longest cold task from `129-174ms` to `56-58ms`; the 10k
range and output remained unchanged.

Pre-checkpoint verification passed lint, 77 unit/API/release/budget tests, demo
and library builds, examples, pinned and floating React 18/19 packed consumers,
and all 11 Chromium packed-browser tests. The browser matrix covers actual
default Pixi/Worker activation, both fallbacks, one-canvas/StrictMode cleanup,
the existing interaction contract, and visual smoke states. Existing Canvas
screenshots were retained; dense WebGL curved-edge antialiasing differed on
`0.58%` of pixels and passes a narrow `0.7%` cross-backend tolerance.

Human UX review at `http://127.0.0.1:4435/` accepted the observed differences
as non-disruptive. Stage 7D is complete and the combined commit/push/PR flow is
authorized. Subsequent approval authorized the `0.3.0` version, merge, tag, and
npm release flow under the same public API and UX/UI constraints.

Stage 7E repeated the full local gate after approval: lint, 77 tests and split
budgets, demo/library builds, examples, pinned and floating React 18/19 packed
consumers, release identity, a zero-vulnerability runtime audit, the 21-file
package dry run, and all 11 Chromium tests passed. Commit `110a45a` was pushed
to `feat/pixi-worker-production-runtime`; PR #48 passed CI and CodeQL, then
squash-merged to `main` as `b511c79`. The approved `0.3.0` package dry run and
release-event identity gate passed before protected tag `v0.3.0` and the GitHub
release were created. Release workflow run `29609893972` passed the required
`npm` environment approval, all repeated consumer/browser gates, and OIDC
Trusted Publishing. The registry now resolves `latest` to `0.3.0` with a
registry signature and SLSA provenance attestation.

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
still Canvas 2D/Main, and no production promotion was performed.

## Goal: No-UX cold-path and memory qualification follow-up

The graph surface, controls, visual output, interaction semantics, public
props/refs/callbacks, production Canvas/Main default, and package budget remain
frozen. This pass may add invisible debug telemetry and retain an internal
optimization only when a fixed-seed A/B shows a material improvement without
changing those contracts.

- [x] Stage 11: Split the fixed 10k cold path and memory/allocation baseline
  - Branch: `feat/obsidian-graph-harness-spike`
  - Verification: fixed-seed 10k Pixi/Worker cold-load profile plus targeted telemetry tests
  - Docs: `docs/debug-harness.md`, `todo.md`
  - Commit: `0f37c1d`
- [x] Stage 12: Remove the largest low-risk cold-path or allocation waste
  - Branch: `feat/obsidian-graph-harness-spike`
  - Verification: same-sequence 10k A/B, interaction smoke, targeted unit tests
  - Docs: `docs/architecture.md`, `docs/debug-harness.md`
  - Commit: `e70bdcf`
- [x] Stage 13: Re-prove API, UI, interaction, package, and consumer compatibility
  - Branch: `feat/obsidian-graph-harness-spike`
  - Verification: lint, unit/API/budget, builds, examples, React 18/19 consumers, Chromium E2E
  - Docs: `todo.md`, relevant architecture/debug notes
  - Commit: `ce64f8b`

Stage 11 added a headed-Chrome/CDP profiler that keeps ordinary timing runs
separate from allocation sampling, because heap sampling and headless software
WebGL both distort Pixi timing. The fixed `1k -> 10k` baseline measured
`1,232-1,249ms` to observed full materialization, `67.7-72.8ms` to first
visible, `16.55-16.82MiB` forced-GC heap growth, and `60` settled graph draws/s.

Stage 12 retained only the default-disabled growth-animation fast path. It
skips timestamp extraction, sorting, and signature construction, then reuses
the complete frame's source-ID set. Enabled growth sequencing and its internal
revealed-count synchronization remain unchanged. Final same-sequence runs kept
materialization effectively flat at `1,236-1,245ms`, reduced first visible to
`64.4-64.7ms`, and reduced the forced-GC heap delta to `15.76-16.30MiB` while
holding `60` draws/s. With profiler observers stopped after the cold window, a
five-cycle run measured 10k heaps of `33.99`, `34.47`, `34.30`, `34.41`, and
`34.76MiB`; the sequence was not monotonic and the final three 1k readings were
all `21.69MiB`. A cold-link containment experiment reduced one sampled function
cost but not end-to-end time and was reverted.

Stage 13 corrected profiler self-interference by using the page clock and
stopping its private rAF/long-task observers after the cold window. It restored
direct disabled-growth coverage through a test-only React hook stub and reduced
the final package entry to `16,908` bytes gzip. The gate passed lint, 75
unit/API/budget tests, demo/library builds, examples, pinned and floating React
18/19 consumers, and all 8 Chromium interaction/visual tests. The built entry
still exports exactly `GraphView`, `defaultGraphPreset`, and
`defaultGraphTheme`, contains no Pixi/Worker marker, and keeps Canvas 2D/Main
as the production default. A debug Pixi/Worker smoke retained one canvas,
hover/select, a 14-node local lens, global restoration, and zero console errors.

## Stop conditions

Stop the spike and report rather than silently widening scope when:

- public callback/ref behavior cannot be preserved without a public API change,
- worker packaging cannot work in both Vite demo and packed React consumers,
- Pixi needs a second consumer-visible canvas,
- 5k performance misses the target after Worker plus retained rendering,
- visual parity requires dropping arbitrary CSS colors/fonts or CJK labels,
- the consumer bundle/runtime cost is not acceptable,
- WebGL fallback changes error, accessibility, or lifecycle semantics.

# Goal: Next.js production consumer recovery

## Objective

Make the packaged production default actually run Pixi WebGL plus Worker
simulation in a Next.js/Turbopack consumer with a strict CSP, while preserving
the existing public API, interaction behavior, fallback policy, and visual
contract. Treat transparent-background rendering and missing graph primitives
as separate findings until each has independent evidence.

Worktree: `/Users/eun/Documents/ograph-next-production-consumer`

Branch: `fix/next-production-consumer-runtime`

Base: `main` at `9a5ee1fa03f5d0ea0c31cfec4a4b3fd2c0123302`

## Non-negotiable invariants

- Keep the runtime exports exactly `GraphView`, `defaultGraphPreset`, and
  `defaultGraphTheme`.
- Keep public props, refs, callbacks, generic metadata, and declarations
  unchanged; do not add a public runtime selector or diagnostic callback.
- Keep fallback behavior silent for recovered environment failures and keep
  consumer `onError` semantics unchanged.
- Add runtime proof through test-owned external instrumentation rather than a
  new production API or visible UI.
- Do not change graph controls, interaction timing, camera behavior, force
  constants, node/link/label appearance, or existing screenshot baselines while
  fixing the Next.js activation failures.
- Do not treat the opaque transparent-theme background and missing primitives
  as one root cause. Fix or approve visual behavior only after a real packed
  consumer proves the exact before/after state.
- Do not push, open a PR, merge, bump the version, tag, or publish without a
  separate explicit approval.

## Stages

- [x] Stage 1: Lock a packed Next.js production consumer failure lane
  - Branch: `fix/next-production-consumer-runtime`
  - Deliverable: fixture-local Next.js/Turbopack production app installed from
    the packed Ograph tarball, strict CSP without `unsafe-eval`, transparent
    theme, deterministic graph, root/selection, and test-owned probes for WebGL,
    Worker construction/messages, fallback, one-canvas lifecycle, and pixels
  - Verification: targeted Next production build/start/Chromium test proving
    the released code does not reach Pixi/Worker
  - Docs: `todo.md`
  - Commit: `b423a21`

- [x] Stage 2: Make the packaged Worker consumer-relative
  - Branch: `fix/next-production-consumer-runtime`
  - Deliverable: Worker starts from the consumer HTTP origin and emits `ready`
    and `tick` without changing public runtime selection or fallback policy
  - Verification: Stage 1 Next production lane plus existing Worker/fallback
    tests and package asset assertions
  - Docs: `docs/architecture.md`, `todo.md`
  - Commit: `516bae4`

- [x] Stage 3: Make Pixi strict-CSP initialization and cleanup reliable
  - Branch: `fix/next-production-consumer-runtime`
  - Deliverable: CSP-safe Pixi startup, idempotent partial initialization
    cleanup, preserved root errors, and no fallback in the success lane
  - Verification: strict-CSP Next lane, forced partial-init failure, existing
    StrictMode and renderer fallback coverage
  - Docs: `docs/architecture.md`, `todo.md`
  - Commit: `a74c6c6`

- [ ] Stage 4: Separate transparent-background parity from missing primitives
  - Branch: `fix/next-production-consumer-runtime`
  - Deliverable: transparent pixels remain transparent and packed 1k/5k
    fixtures report and visibly render nonzero nodes/links; any remaining
    Afterglow-only empty state gets its own proven cause
  - Verification: pixel smoke, selected/root and unselected fixtures, pan,
    zoom, hover, selection, and camera focus
  - Docs: `docs/architecture.md`, `todo.md`
  - Human UX checkpoint: required before accepting visual-output changes
  - Commit: `<pending>`

- [ ] Stage 5: Re-prove compatibility and prepare a patch release
  - Branch: `fix/next-production-consumer-runtime`
  - Verification: lint, unit/API/budget tests, demo/library builds, examples,
    pinned and floating React 18/19 consumers, Vite packed browser suite, Next
    production consumer suite, package dry run, and release identity dry run
  - Docs: architecture, debug harness, changelog, this plan
  - Commit: `<pending>`

## Stop conditions

Stop and report rather than widening scope when:

- the fix requires a public API or observable interaction change,
- Worker packaging cannot be made consumer-relative across both Vite and Next,
- CSP compatibility requires weakening the consumer policy,
- transparent-background parity requires changing opaque-theme output,
- missing primitives cannot be reproduced independently of the background, or
- a screenshot baseline would need to change before human UX approval.

## Stage 1 failure evidence (2026-07-19)

The fixture packs the current branch, installs that tarball into a fixture-local
Next.js `16.2.6` application, runs a Turbopack production build, starts the
production server on port `4310`, and applies a strict CSP without
`unsafe-eval`. Browser probes are installed before application code and do not
change the package API or production DOM contract.

The production build and mount succeeded. The three-test Chromium lane produced
the intended red baseline: the transparent-pixel and one-canvas checks passed,
while the effective-runtime check failed with `renderer: 2d`, a `file:` Worker
URL, one Worker construction error, no `ready` or `tick` response, and one CSP
violation. Consumer `onError` remained empty. This independently locks the two
activation failures from #54 without treating #55's transparent background as
already broken on the Canvas fallback path.

Stage verification:

- `npm run lint` — passed.
- fixture `next build` — passed.
- `npx playwright test --config playwright.next.config.ts` — expected baseline:
  2 passed, 1 failed on the Pixi/Worker success assertion.
- `git diff --check` — passed.

## Stage 3 CSP and cleanup evidence (2026-07-19)

The lazy Pixi chunk now loads `pixi.js/unsafe-eval` before the main Pixi import,
and the library build externalizes both specifiers so the compatibility
extensions register on the same Pixi instance in downstream bundles. The
consumer CSP remains unchanged and does not include `unsafe-eval`.

Initialization cleanup now nulls the retained application reference before
destroying Pixi resources, and the lazy wrapper preserves the original
initialization error if partial cleanup also throws. A focused unit regression
forces both failures and proves that the initialization error remains the
reported one.

The packed Next.js success test now passes with WebGL2, an HTTP-origin Worker,
`ready` and `tick` messages, zero CSP violations, zero Worker errors, zero
browser errors, zero consumer `onError` entries, and exactly one canvas. The
only remaining Next failure is the independent #55 alpha assertion: the
transparent fixture produced just `48` transparent pixels instead of the
required `>1,000`. StrictMode's one-canvas test still passes.

Stage verification:

- `npm test` — 78 passed; package and performance budgets passed.
- `npm run test:browser` — 11 passed in the packed Vite consumer.
- `npx playwright test --config playwright.next.config.ts` — 2 passed, 1 failed
  only on transparent alpha, with the Pixi/Worker strict-CSP success lane green.
- `npm run lint` and `git diff --check` — passed before commit.

## Stage 2 Worker evidence (2026-07-19)

The production Worker factory now consumes Vite's Worker-constructor module
instead of wrapping Vite's generated asset URL in a second `new URL(...)`.
The built library retains one package-relative Worker asset reference and the
same module/name semantics. No public type or runtime export changed.

In the packed Next.js production lane, the failure state narrowed exactly as
intended: the Worker URL changed from `file:` to `http:` on
`http://127.0.0.1:4310`, construction errors fell from one to zero, and both
`ready` and `tick` arrived. The lane remains intentionally red only because
Pixi still violates CSP and recovers to Canvas 2D; the transparent-pixel and
one-canvas checks continue to pass.

Stage verification:

- `npm test` — 77 passed; package and performance budgets passed.
- `npm run test:browser` — 11 passed in the packed Vite consumer.
- `npm run test:browser:next` — expected intermediate state: 2 passed, 1 failed
  only on `cspViolationCount: 1` and `renderer: 2d`; Worker fields all matched
  the success contract.
- `git diff --check` — passed.
