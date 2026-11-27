# Contributing

Thanks for taking the time to improve Ograph.

## Local Setup

Use Node.js 22.14.0 or newer for repository development and verification.

```sh
npm install
npm run dev
```

The development app opens the public graph playground. Use **Debug lab**
(`/#debug`) for runtime controls, local focus lenses, and stress-test data.

## Before Opening A Pull Request

Run the full local verification suite:

```sh
npm run test
npm run lint
npm run build
npm run check:examples
npm run verify:consumer
npx playwright install chromium
npm run test:browser
npm run test:demo
```

Browser tests start a dedicated consumer server and reject an occupied port.
When another worktree uses port 4179, run
`OGRAPH_BROWSER_PORT=4187 npm run test:browser`.

Keep changes focused and describe the user-visible behavior or maintainer
problem that the pull request solves.

## Versioning Policy

While Ograph is below `1.0.0`, choose a version by the impact on existing
consumers. This is the project's pre-1.0 policy; it does not apply the stable
SemVer rule that every additive public API requires a minor release.

| Change | Pre-1.0 version increment | Example |
| --- | --- | --- |
| Bug fix, compatible internal/performance improvement, or optional API addition that preserves existing calls and defaults | Patch (`0.y.z` → `0.y.(z+1)`) | `0.4.0` → `0.4.1` for optional camera controls and the Worker lifecycle fix |
| Change requiring consumer migration, including removed/renamed APIs, newly required arguments, incompatible types/default behavior, or increased runtime/peer requirements | Minor (`0.y.z` → `0.(y+1).0`) | `0.4.x` → `0.5.0` with migration notes |
| Adoption of the stable public API contract | `1.0.0` | A separately planned stability release |

Existing consumers should be able to update within a `0.y.x` line without
rewriting their integration. A feature's size or the number of new APIs alone
does not decide the increment. An apparently additive type change that breaks
existing code (for example exhaustive union checks) belongs in the migration
category. Assess observable behavior and supported environments as well as
function signatures.

From `1.0.0` onward, use standard SemVer: patch for compatible fixes, minor for
compatible functionality additions, and major for incompatible changes.

For every release, state the compatibility impact in `CHANGELOG.md`, keep
`package.json`, the root lockfile version, the debug version fallback, and the
dated changelog heading aligned, and verify that the version is unused on npm.
Documentation-only changes do not require a package bump unless published as a
new package release. Never reuse a published version. Release tags and npm
publishing remain separate from local version preparation.

## Project Boundaries

The package API is exported from `src/components/graph/index.ts`.
Consumer apps should not depend on debug harness files or internal hooks.

This package owns graph rendering, graph interaction, layout presets, local
lens behavior, and TypeScript graph contracts. Consumer applications own
persistence, routing, content CRUD, auth, and domain-specific metadata.

## Useful Issue Reports

Please include:

- The package version or commit.
- A minimal `nodes` and `links` sample when graph data affects the issue.
- Browser and device details for rendering or pointer interaction bugs.
- Whether reduced motion, touch, wheel, or high-DPI display behavior is involved.
