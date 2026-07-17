# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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
