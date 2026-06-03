# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-02
- Primary product surfaces: Reusable canvas graph component and local Vite stress-test harness.
- Evidence reviewed: `README.md`, `docs/api.md`, `docs/architecture.md`, `docs/debug-harness.md`, `src/components/graph/*`, and `src/components/graph/debug/*`.

## Brand
- Personality: Quiet, technical, and graph-native.
- Trust signals: Stable spatial layout, predictable controls, responsive transitions, and visible stress-test telemetry.
- Avoid: Decorative motion, abrupt graph replacement, excessive labels, and controls that obscure the graph.

## Product goals
- Goals: Make large knowledge graphs readable, preserve spatial memory across focus changes, and keep local exploration responsive.
- Non-goals: Persistence, routing, content CRUD, authentication, and consumer-specific metadata interpretation.
- Success signals: Global and local exploration feel continuous; 10,000-node stress mode remains interactive after initial layout stabilization.

## Personas and jobs
- Primary personas: Developers integrating the graph package and users exploring linked notes.
- User jobs: Inspect the full graph, focus on a neighborhood, pan and zoom, identify nodes, and adjust layout physics during development.
- Key contexts of use: Desktop note exploration, touch-capable devices, and local performance tuning.

## Information architecture
- Primary navigation: Global and local lens modes inside the graph surface.
- Core routes/screens: One reusable graph canvas and one debug harness.
- Content hierarchy: Graph canvas first; compact telemetry and tuning controls second.

## Design principles
- Preserve spatial memory: Local mode is a focus lens over the global layout, not a separate layout.
- Align camera and physics motion: Start the local halo simulation with zoom-in, while lens-external elements remain as render-only fade ghosts.
- Tradeoffs: Local mode retains one hidden BFS halo ring, preserves sparse-scope centroid gravity, and uses low-heat drag reheating to stabilize boundary nodes while limiting force cost.

## Visual language
- Color: Dark canvas with semantic node colors and restrained focus highlights.
- Typography: System sans-serif labels and compact monospaced telemetry.
- Spacing/layout rhythm: Dense utility layout with stable graph dimensions.
- Shape/radius/elevation: Compact controls and shallow panels; avoid decorative containers.
- Motion: Balanced 360ms lens transitions. Links fade before nodes fully settle. Respect `prefers-reduced-motion`.
- Imagery/iconography: Use existing Lucide icons in the debug harness.

## Components
- Existing components to reuse: `GraphView`, debug harness controls, canvas renderer, and graph hooks.
- New/changed components: Local lens scope hook and internal spatial index.
- Variants and states: Global, local lens, hover, selection, drag, drag telemetry, transition, hidden halo, and reduced motion.
- Token/component ownership: Production theme and preset remain owned by `src/components/graph/presets.ts`.

## Accessibility
- Target standard: Preserve keyboard-neutral canvas behavior and readable telemetry contrast.
- Keyboard/focus behavior: Existing pointer-focused interaction contract remains unchanged.
- Contrast/readability: Focused labels remain forced visible; unrelated labels stay culled or dimmed.
- Screen-reader semantics: No new semantic canvas contract is introduced in this iteration.
- Reduced motion and sensory considerations: Lens visibility and viewport changes apply immediately under `prefers-reduced-motion: reduce`.

## Responsive behavior
- Supported breakpoints/devices: Existing desktop, mobile, wheel, pointer, and touch pinch surfaces.
- Layout adaptations: Debug controls remain stacked on small screens and side-aligned on large screens.
- Touch/hover differences: Touch uses pinch zoom; hover-only tooltip behavior remains pointer-driven.

## Interaction states
- Loading: Initial global simulation settles asynchronously.
- Empty: Invalid local roots produce an empty lens without moving the camera.
- Error: No new error surface.
- Success: Lens changes fade and zoom without replacing the visible layout abruptly.
- Selection vs root focus: Node selection and local-lens root focus are distinct; the debug harness clears diagnostic selection when setting a root or returning to global mode.
- Disabled: Hidden and halo-only nodes cannot be hit-tested.
- Offline/slow network, if applicable: Not applicable; the package is local-data driven.

## Content voice
- Tone: Compact and technical.
- Terminology: Use “global mode”, “local lens”, “visible scope”, and “physics halo”.
- Microcopy rules: Telemetry distinguishes visible from simulated elements.

## Implementation constraints
- Framework/styling system: React, TypeScript, canvas, d3-force, Tailwind-powered debug harness.
- Design-token constraints: Preserve existing public theme and preset API.
- Performance constraints: Cull rendering outside an 80 CSS-pixel viewport buffer; use a uniform-grid spatial index for render and hit-test queries; target 30 FPS after stabilization in the 10,000-node stress harness.
- Compatibility constraints: Keep `mode`, `rootNodeId`, and `localDepth` public props backward compatible.
- Test/screenshot expectations: Run unit tests, type checking, production build, and browser verification for global/local transitions.

## Open questions
- [ ] Determine whether a future worker-backed initial global layout is worthwhile above 10,000 nodes / package owner / future scalability.
