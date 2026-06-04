# Contributing

Thanks for taking the time to improve Ograph.

## Local Setup

```sh
npm install
npm run dev
```

The development app is a Vite debug harness for inspecting global graphs,
local focus lenses, pointer interactions, and stress-test data.

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
```

Keep changes focused and describe the user-visible behavior or maintainer
problem that the pull request solves.

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
