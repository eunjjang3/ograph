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

- [ ] Stage 2: Introduce private renderer/simulation seams with baseline parity
  - Branch: `feat/obsidian-graph-harness-spike`
  - Likely files: `GraphView.tsx`, `useGraphRenderLoop.ts`,
    `useGraphSimulation.ts`, new internal runtime/backend modules, debug harness
  - Deliverable: private runtime seam and telemetry; the public `GraphView`
    remains wired to Canvas 2D plus main-thread simulation. The selector is
    enabled as the experimental lanes land in Stages 3 and 4.
  - Verification: API-surface tests, graph-logic tests, packed React 18/19
    consumer compilation, current browser interaction/visual suite
  - Docs: `docs/architecture.md`, `docs/debug-harness.md`
  - Commit: `<pending>`

- [ ] Stage 3: Add a Worker simulation lane to the debug harness
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
  - Commit: `<pending>`

- [ ] Stage 4: Add a Pixi WebGL renderer lane to the debug harness
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
  - Commit: `<pending>`

- [ ] Stage 5: Add Obsidian-style work avoidance to the Pixi lane
  - Branch: `feat/obsidian-graph-harness-spike`
  - Likely files: Pixi backend, frame scheduler, spatial-index/culling helpers,
    debug telemetry
  - Deliverable: viewport-prioritized node/label materialization budget,
    endpoint-gated link materialization, offscreen visibility culling, bounded
    label objects, and fully idle render-loop shutdown
  - Verification: cold-load/first-frame metrics, pan into unmaterialized areas,
    zoom label transitions, memory/object-count telemetry, 10k stress run
  - Docs: `docs/architecture.md`, `docs/debug-harness.md`
  - Commit: `<pending>`

- [ ] Stage 6: Run the four-lane acceptance comparison and make a promotion decision
  - Branch: `feat/obsidian-graph-harness-spike`
  - Deliverable: recorded results for all fixtures/phases, visual diffs,
    consumer bundle delta, lifecycle failures, and a written go/no-go decision
  - Verification: `npm run lint`, `npm run test`, `npm run build`,
    `npm run check:examples`, `npm run verify:consumer:pinned`,
    `npm run verify:consumer:floating`, `npm run test:browser`, package budget
  - Docs: results and decision appended to this file plus relevant architecture
    and debug-harness documentation
  - Commit: `<pending>`

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

## Stop conditions

Stop the spike and report rather than silently widening scope when:

- public callback/ref behavior cannot be preserved without a public API change,
- worker packaging cannot work in both Vite demo and packed React consumers,
- Pixi needs a second consumer-visible canvas,
- 5k performance misses the target after Worker plus retained rendering,
- visual parity requires dropping arbitrary CSS colors/fonts or CJK labels,
- the consumer bundle/runtime cost is not acceptable,
- WebGL fallback changes error, accessibility, or lifecycle semantics.
