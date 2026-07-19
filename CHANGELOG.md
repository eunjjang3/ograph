# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.3.1 - 2026-07-19

This patch keeps the existing `GraphView` props, ref methods, callbacks,
runtime exports, interaction model, and automatic fallback policy. It hardens
the packaged Pixi WebGL/Worker runtime in strict-CSP Next.js consumers and
restores transparent-theme composition.

### Added

- Added a packed Next.js production-consumer lane using Turbopack, React 19,
  strict CSP without `unsafe-eval`, external Worker/context probes, transparent
  pixel checks, 1,000/5,000-node primitive smoke, and StrictMode lifecycle
  coverage.

### Changed

- Made the Pixi WebGL context alpha-capable at initialization and apply the
  parsed background tint and alpha on every frame.
- Kept focus-dimmed nodes translucent while occluding graph links behind their
  fills in both Pixi and Canvas 2D. Alpha-theme Pixi occlusion particles are
  allocated lazily; the default opaque 10,000-node lane retains its previous
  frame and heap profile.

### Fixed

- Replaced the nested packaged Worker URL with Vite's Worker-constructor module
  so Next.js rebases the module Worker to the consumer HTTP origin.
- Loaded Pixi's CSP compatibility extension on the same externalized Pixi
  instance, allowing strict-CSP WebGL initialization without weakening the
  consumer's `script-src` policy.
- Preserved the original Pixi initialization error when best-effort partial
  cleanup also throws, and made application disposal safe during incomplete
  initialization.
- Restored fully transparent and translucent theme backgrounds without changing
  opaque background output, and prevented focus-dimmed nodes from revealing
  links as if edges passed through their fills.

### Verified

- Preserved the public declarations and runtime exports with 79 unit, API,
  release, and budget tests; 11 packed Vite consumer browser tests; and 6
  packed Next.js production-consumer browser tests.
- Reconfirmed one-canvas StrictMode behavior, both automatic fallbacks,
  hover/click/drag/pan/zoom/camera interactions, existing visual snapshots,
  strict CSP, HTTP Worker `ready`/`tick`, and zero consumer/browser errors.

## 0.3.0 - 2026-07-18

This release keeps the existing `GraphView` props, ref methods,
callbacks, runtime exports, graph appearance, and interaction model. Pixi
WebGL and Worker simulation become internal defaults with automatic per-lane
fallbacks; no renderer or simulation selector is added to the public API.

### Added

- Added package-owned lazy graph chunks and a package-relative module Worker
  asset, with separate synchronous-entry, lazy-chunk, and Worker gzip budgets.
- Added packed-consumer coverage proving default Pixi/Worker activation,
  WebGL-to-Canvas recovery, Worker-to-main recovery, one-canvas lifecycle, and
  recovered failures that do not surface through consumer `onError`.

### Changed

- Promoted Pixi WebGL plus Worker simulation behind the existing `GraphView`
  API while retaining Canvas 2D and main-thread simulation as internal
  environment fallbacks.
- Made `pixi.js` an exact runtime dependency while keeping it external to
  Ograph's package-owned chunks for consumer-bundler deduplication.
- Extended the fixed-seed profiler with a selectable 2,500/5,000/10,000-node
  target for repeatable intermediate-size qualification.

### Fixed

- Replaced quadratic pending-link `Array.shift()` materialization with in-place
  queue compaction. The fixed 5,000-node sequence improved complete
  materialization from `1.188-1.193s` to `0.686-0.713s` without changing its
  first-visible or steady-frame behavior.
- Made WebGL pixel smoke checks read browser-composited screenshots instead of
  an invalidated non-preserved drawing buffer, and stabilized the StrictMode
  test on completed asynchronous Pixi initialization.

### Verified

- Preserved exactly one canvas, the existing Canvas visual baselines, public
  declarations, and runtime exports (`GraphView`, `defaultGraphPreset`, and
  `defaultGraphTheme`).
- Passed 77 unit/API/release/budget tests and all 11 packed-consumer Chromium
  interaction, fallback, lifecycle, and visual tests; human review accepted the
  remaining cold-load and rasterization differences as non-disruptive to UX.

## 0.2.0 - 2026-07-18

This release keeps the consumer-facing graph appearance, interactions, public
runtime exports, and Canvas 2D/Main Thread default unchanged. Pixi WebGL and
Worker simulation remain debug-harness-only promotion candidates.

### Added

- Added optional settled and interaction-time label paint budgets to
  `GraphPreset`, allowing consumers to bound canvas text calls while preserving
  hovered, selected, and root labels.
- Added a private renderer/simulation runtime seam and a four-lane debug matrix
  for Canvas 2D or Pixi WebGL rendering with Main Thread or Worker simulation.
- Added debug runtime telemetry for frame cadence, p95 intervals, long tasks,
  renderer phases, Worker updates, heap use, and cold-path milestones.
- Added a repeatable Playwright profiling script for fixed-seed 1,000- and
  10,000-node harness scenarios.

### Changed

- Reduced settled and active-frame work by reusing graph indexes, topology
  views, materialization queues, particle batches, and full-view culling state.
- Skipped disabled graph-growth setup and other cold-path allocations without
  changing growth animation behavior when it is enabled.
- Bound the local debug server to port `4435` with strict port selection.

### Fixed

- Hardened lazy Pixi initialization so runtime lane changes cannot resize an
  application before its renderer is ready.
- Hardened Worker pause, graph-revision, transferable-buffer recycling, and
  StrictMode cleanup behavior.

### Verified

- Preserved the public runtime exports as `GraphView`, `defaultGraphPreset`,
  and `defaultGraphTheme`, with no Pixi or Worker assets in the package entry.
- Re-ran lint, unit and package-budget tests, demo and library builds, examples,
  React 18/19 packed-consumer checks, browser interactions, and visual smoke
  coverage.
- Confirmed the debug Pixi/Worker lane retains hover, selection, local/global
  transitions, and one-canvas lifecycle behavior at up to 10,000 nodes.

## 0.1.0 - 2026-06-05

Initial public preview.

### Added

- `GraphView` React canvas component for force-directed graphs.
- Global graph mode and local focus lens mode.
- Hover, selection, node dragging, panning, wheel zoom, and pinch zoom.
- Public TypeScript contracts for graph data, themes, presets, viewport state,
  component props, and imperative ref methods.
- Default dark graph theme and graph preset.
- Deterministic Vite debug harness with graph stress-test presets up to 10,000
  nodes.
- Documentation for API usage, architecture, debug harness behavior, and
  consumer package boundaries.
- Regression tests for graph traversal, malformed link filtering, hit testing,
  spatial index behavior, viewport fitting, render-loop scheduling, and local
  lens physics.

### Changed

- Moved production `GraphView` container, canvas, touch, tooltip, and error
  fallback styles to inline styles so package consumers do not need Tailwind
  CSS for core graph behavior.
- Preserved the `"use client"` directive in the library build output for React
  server-component consumers.
- Included repository docs and policy files in the package tarball and marked
  the scoped package for public npm publishing.
- Tightened `onError` handling across React render failures, canvas draw-loop
  failures, and simulation setup/tick failures.
- Preserved consumer node metadata types through `GraphViewProps` data props
  and node callbacks.
- Stabilized reduced-motion local lens viewport effects when consumers pass
  inline `onViewportChange` callbacks.
- Removed malformed public `node.size` values at the input boundary so invalid
  radius values cannot terminate canvas rendering.

### Verified

- Added package-surface regression tests for the client directive,
  metadata-generics declarations, public scoped publish metadata, and packaged
  documentation files.
- Added packed-consumer browser coverage for the stable interaction matrix,
  StrictMode cleanup, resize, invalid/disconnected/dense fixtures, and visual
  smoke baselines.
