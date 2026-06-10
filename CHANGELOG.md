# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Added optional settled and interaction-time label paint budgets to
  `GraphPreset`, allowing consumers to bound canvas text calls while preserving
  hovered, selected, and root labels.

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
