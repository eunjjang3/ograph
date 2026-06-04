# Hardening Roadmap

This repository is the canonical public home for Ograph.

- Product name: Ograph
- Package name: `@afterglow/ograph`
- Repository: `eunjjang3/ograph`
- Default branch: `main`

The roadmap tracks the remaining work needed to make Ograph safe for external
open-source consumers. It is a repository-only planning document and is not
included in the npm package tarball.

## Current Baseline

- Baseline date: 2026-06-04 KST
- Public baseline commit: `f486ee32086f6e35435977d4bf70a59b8eebb294`
- Public repository: `https://github.com/eunjjang3/ograph`
- Package candidate: `@afterglow/ograph@0.1.0`
- npm publication status: first public npm publication candidate

The baseline already contains the app-agnostic package snapshot, public
documentation, CI, release workflow, OpenSSF Scorecard workflow, package
budget checks, packed consumer verification, and React 18/19 declaration
compatibility.

## Non-Negotiable Product Constraints

- Keep the debug harness physics and graph interaction feel unchanged while
  hardening package boundaries, tests, docs, and release trust.
- Do not change force constants, viewport behavior, animation timing, or
  default visual output to make hardening tests pass.
- Keep app-specific concepts outside Ograph. Consumer apps own persistence,
  routing, editing flows, auth, and domain metadata.
- Do not add new dependencies without an explicit maintainer decision.
- Do not tag a stable release until Playwright browser coverage is promoted
  into CI.

## Priority Queue

| Priority | Item | Status | Branch | Evidence commit |
| --- | --- | --- | --- | --- |
| P0 | Keep public API narrow: runtime exports only `GraphView`, `defaultGraphPreset`, and `defaultGraphTheme`. | Done in public snapshot | `main` | `f486ee32086f6e35435977d4bf70a59b8eebb294` |
| P0 | Keep input normalization centralized and defensive: no caller mutation, no dangling/self links, duplicate node handling, invalid coordinate fallback. | Done in public snapshot | `main` | `f486ee32086f6e35435977d4bf70a59b8eebb294` |
| P0 | Preserve React 18 and React 19 packed-consumer TypeScript compatibility. | Done in public snapshot | `main` | `f486ee32086f6e35435977d4bf70a59b8eebb294` |
| P1 | Track the public canonical repository hardening queue and release gates in this repo. | Done | `hardening/p1-public-canonical-ledger` | `5c26f3f668cc5d7c70e2f0bfdd18c6b199a0841f` |
| P1 | Keep release/security docs aligned with the public `main` branch. | Done | `hardening/p1-public-canonical-ledger` | `5c26f3f668cc5d7c70e2f0bfdd18c6b199a0841f` |
| P1 | Keep repo-only hardening docs out of the package tarball. | Done | `hardening/p1-public-canonical-ledger` | `5c26f3f668cc5d7c70e2f0bfdd18c6b199a0841f` |
| P1 | Add Playwright browser interaction and visual smoke coverage before any stable release. | Done | `hardening/p1-playwright-browser-gate` | `2ce362b623dc306ef4e7d90bf16f451e3a29601b` |
| P1 | Align CI with the Node 22.14.0 release/development toolchain required by current Vite and Tailwind dev dependencies. | In progress | `hardening/p1-ci-node-toolchain` | Pending |
| P2 | Confirm GitHub Private Vulnerability Reporting after public visibility and repository settings are available. | External setting | GitHub settings | Pending |
| P2 | Configure npm Trusted Publishing for `@afterglow/ograph` through `.github/workflows/release.yml` and the `npm` environment. | External setting | npm/GitHub settings | Pending |
| P2 | Protect `main` with required CI checks before broad external adoption. | External setting | GitHub settings | Pending |
| P2 | Confirm the first public OpenSSF Scorecard run, then add a README badge only if the result is acceptable. | External setting | GitHub Actions | Pending |
| P3 | Evaluate property-based tests for graph normalization after dependency approval. | Future decision | TBD | Pending |
| P3 | Evaluate a headless core export only after preview API feedback. | Future decision | TBD | Pending |
| P3 | Evaluate public debug events only after consumer diagnostics needs are observed. | Future decision | TBD | Pending |

## Stable Release Gate

Preview releases may use the current no-new-dependency verification path:

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run check:examples`
- `npm run verify:consumer`
- `npx playwright install chromium`
- `npm run test:browser`
- `npm audit --omit=dev`
- `npm pack --dry-run`
- `npm publish --dry-run --access public`

Stable releases additionally require Playwright coverage for the packed package
consumer boundary. The initial stable gate uses Chromium only; add Firefox and
WebKit after the Chromium lane is stable enough that failures are actionable.

The stable Playwright gate should cover:

- package mount renders exactly one canvas,
- empty, single-node, small, medium, dense, disconnected, and invalid-coordinate
  graph fixtures render without throwing,
- medium graph rendering produces non-blank canvas pixels,
- pan and wheel zoom preserve a usable viewport,
- wheel zoom preserves the pointer anchor within tolerance,
- node click, double-click, hover, and drag callbacks fire correctly,
- drag release clears pins even when terminal pointer events are missed,
- resize redraws without unexpected viewport reset,
- local/global mode transitions do not leave stale hover or selection state,
- React StrictMode unmount/remount does not duplicate listeners or leave
  animation frames alive.

Visual smoke coverage should include empty graph, basic graph, selected node,
hovered node, local lens, and dense graph states. Canvas tests must include a
pixel-level non-blank assertion before screenshot comparison so empty canvas
failures are direct.

## Completion Evidence

The public baseline has been verified locally with:

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run check:examples`
- `npm run verify:consumer`

`npm run verify:consumer` packs the package, installs the tarball into
temporary React 18 and React 19 consumer projects, verifies runtime exports,
and compiles consumer TypeScript with `skipLibCheck: false`,
`allowSyntheticDefaultImports: false`, and `esModuleInterop: false`.
