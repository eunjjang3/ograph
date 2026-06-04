# Release Runbook

This runbook is for maintainers preparing the first public npm release of
Ograph. It is intentionally repo-only and is not included in the npm package
tarball.

## Fixed Release Identity

- Product name: Ograph
- npm package: `@eunjjang/ograph`
- GitHub repository: `eunjjang3/ograph`
- Release workflow: `.github/workflows/release.yml`
- GitHub environment: `npm`

Do not rename the repository, package, or product during release hardening.

## Current Release State

The repository-side release path is prepared for the `@eunjjang/ograph`
package identity. npm CLI authentication is available, but the first registry
package creation and Trusted Publishing configuration still require
maintainer-controlled npm 2FA/proof-of-presence.

Current evidence from 2026-06-04 KST:

- Local npm CLI is `11.12.1`.
- `npm whoami` returns `eunjjang`.
- `npm access list packages eunjjang --json` returns `{}`.
- `npm view @eunjjang/ograph version --json` returns `E404`, as expected
  before the first publish creates the registry package.
- `npm publish --dry-run --access public` succeeds for
  `@eunjjang/ograph@0.1.0`.
- `npm trust list @eunjjang/ograph --json` reaches `EOTP`, meaning npm
  requires a one-time password/browser confirmation before trusted-publisher
  inspection or configuration can continue.
- The package must exist in npm registry/package settings before `npm trust`
  can configure a trusted publisher from the CLI.
- GitHub repository ruleset `Protect release tags` (`17266129`) is active for
  `refs/tags/v*` and blocks deletion and non-fast-forward updates without
  bypass actors.
- `main` branch protection enforces required checks for administrators, so
  release-prep changes must land through a checked branch/PR path rather than
  admin direct-push bypass.

## Trusted Publishing Requirements

npm Trusted Publishing uses OIDC between npm and the CI provider. For this
repository, the required release shape is:

- npm CLI `11.5.1` or newer for OIDC publish.
- npm CLI `11.10.0` or newer for `npm trust` configuration commands.
- Node.js `22.14.0` or newer.
- GitHub-hosted runner, not a self-hosted runner.
- Workflow job permission `id-token: write`.
- Public GitHub repository and public package.
- `package.json` `repository.url` matching `github.com/eunjjang3/ograph`.
- A Trusted Publisher configured for GitHub Actions on npmjs.com or with
  `npm trust`.

The existing release workflow already uses Node `22.14.0`, installs
`npm@11.5.1`, runs on `ubuntu-latest`, uses `id-token: write`, disables
package-manager caching for the publish job, and publishes only from the
canonical `eunjjang3/ograph` repository. It also verifies that the package
name, package repository URL, GitHub repository context, and release tag match
the intended `@eunjjang/ograph` identity before npm publish can run. Release
events additionally require exactly one dated changelog heading for the
package version, an empty `## Unreleased` section, and a release tag commit
that is reachable from protected `origin/main`.

GitHub repository ruleset `Protect release tags` protects `v*` release tags
from deletion and non-fast-forward updates. Keep it active because GitHub
release events and `v*` tags are the publish trigger boundary.

## First Publish Procedure

1. Confirm the local tree is clean and `main` is up to date.

   ```sh
   git switch main
   git pull --ff-only origin main
   git status --short --branch
   ```

2. Run the full local release gate.

   ```sh
   npm run lint
   npm run test
   npm run build
   npm run check:examples
   npm run verify:consumer:pinned
   npm run verify:consumer:floating
   node scripts/verify-release-identity.mjs
   npx playwright install chromium
   npm run test:browser
   npm audit --omit=dev
   npm pack --dry-run
   npm publish --dry-run --access public
   ```

3. Confirm GitHub release gates are green on `main`.

   Required:

   - CI `verify`
   - CodeQL `analyze`
   - Scorecard `analysis`

   `main` branch protection must also keep administrator enforcement enabled.
   Confirm before release:

   ```sh
   gh api repos/eunjjang3/ograph/branches/main/protection \
     --jq '.enforce_admins.enabled'
   ```

4. Create the npm package under the `eunjjang` scope only after explicit
   maintainer approval for the first real publish. npm cannot configure a
   trusted publisher for a package that is not already on the registry, and
   the first real publish permanently consumes the `0.1.0` package version.

5. Configure Trusted Publishing for `@eunjjang/ograph`.

   npmjs.com path:

   - Package settings
   - Trusted publishing
   - Provider: GitHub Actions
   - Repository: `eunjjang3/ograph`
   - Workflow filename: `release.yml`
   - Environment: `npm`
   - Allowed action: `npm publish`

   CLI path after the package exists and npm proof-of-presence is available:

   ```sh
   npm install -g npm@^11.10.0
   npm trust github @eunjjang/ograph \
     --repo eunjjang3/ograph \
     --file release.yml \
     --environment npm \
     --allow-publish
   npm trust list @eunjjang/ograph
   ```

6. Restrict traditional token publishing after Trusted Publishing has been
   verified. In npm package settings, prefer requiring 2FA and disallowing
   tokens for publishing access.

7. Finalize the changelog in a reviewed commit. Move all release notes out of
   `## Unreleased`, leave that section empty, and add exactly one dated heading
   matching the package version:

   ```md
   ## Unreleased

   ## 0.1.0 - 2026-06-04
   ```

   Until this commit lands, `CHANGELOG.md` must continue to describe the
   package as unreleased. The release identity guard intentionally rejects a
   release event while notes remain under `## Unreleased` or the dated version
   heading is missing.

8. Confirm the release tag ruleset is active, then create a `v*` tag and
   GitHub release only after the above gates are green. For the first public
   preview, the tag must match the existing `package.json` version.

   ```sh
   VERSION="$(node -p 'require("./package.json").version')"
   npm run lint
   npm run test
   npm run build
   npm run check:examples
   npm run verify:consumer:pinned
   npm run verify:consumer:floating
   GITHUB_EVENT_NAME=release GITHUB_REF="refs/tags/v${VERSION}" GITHUB_SHA="$(git rev-parse HEAD)" node scripts/verify-release-identity.mjs
   npm run test:browser
   gh api repos/eunjjang3/ograph/rulesets/17266129 \
     --jq '.name, .target, .enforcement'
   git tag "v${VERSION}"
   git push origin main --tags
   ```

9. Publish through a GitHub release for the tag. The `npm` environment requires
   maintainer approval before the publish job can proceed.

   ```sh
   gh release create "v${VERSION}" \
     --title "v${VERSION}" \
     --notes-file CHANGELOG.md
   ```

10. After publish, verify the registry state.

   ```sh
   npm view @eunjjang/ograph version
   npm view @eunjjang/ograph repository.url
   npm audit signatures
   ```

## Do Not

- Do not publish with a long-lived `NPM_TOKEN` while Trusted Publishing is the
  selected release policy.
- Do not bypass the GitHub `npm` environment approval for real publishes.
- Do not add a Scorecard badge until the score is high enough to be a useful
  public trust signal.
- Do not publish stable releases before the packed Playwright consumer gate is
  green in CI.
