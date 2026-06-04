# Release Runbook

This runbook is for maintainers operating public npm releases of Ograph. It is
intentionally repo-only and is not included in the npm package tarball.

## Fixed Release Identity

- Product name: Ograph
- npm package: `@eunjjang/ograph`
- GitHub repository: `eunjjang3/ograph`
- Release workflow: `.github/workflows/release.yml`
- GitHub environment: `npm`

Do not rename the repository, package, or product during release hardening.

## Current Release State

The `@eunjjang/ograph` package is published on npm as a public preview package.
The first registry package creation has consumed version `0.1.0`, and npm
Trusted Publishing is configured for the GitHub release workflow.

Current evidence from 2026-06-05 KST:

- `npm view @eunjjang/ograph version --json` returns `0.1.0`.
- `npm view @eunjjang/ograph dist-tags --json` points `latest` at `0.1.0`.
- `npm access get status @eunjjang/ograph --json` returns `public`.
- `npm access list packages eunjjang --json` returns
  `{"@eunjjang/ograph":"read-write"}`.
- `npm audit signatures --json` returns no invalid or missing signatures.
- `npx -y npm@11.16.0 trust list @eunjjang/ograph --json` returns a GitHub
  trusted publisher for repository `eunjjang3/ograph`, workflow
  `release.yml`, environment `npm`, and permission `createPackage`.
- Local npm CLI is `11.12.1`; use `npx -y npm@11.16.0` or newer for trust
  commands that need the allowed-action flags.
- `npm whoami` returns `eunjjang`.
- GitHub repository ruleset `Protect release tags` (`17266129`) is active for
  `refs/tags/v*` and blocks deletion and non-fast-forward updates without
  bypass actors.
- `main` branch protection enforces required checks for administrators, so
  release-prep changes must land through a checked branch/PR path rather than
  admin direct-push bypass.

## Trusted Publishing Requirements

npm Trusted Publishing uses OIDC between npm and the CI provider. For this
repository, the required release shape is:

- npm CLI `11.5.1` or newer for OIDC publish; the workflow installs
  `npm@11.16.0` from a SHA512-verified tarball.
- npm CLI `11.16.0` or newer for `npm trust` configuration commands that set
  allowed actions.
- Node.js `22.14.0` or newer.
- GitHub-hosted runner, not a self-hosted runner.
- Workflow job permission `id-token: write`.
- Public GitHub repository and public package.
- `package.json` `repository.url` matching `github.com/eunjjang3/ograph`.
- A Trusted Publisher configured for GitHub Actions on npmjs.com or with
  `npm trust`.

The existing release workflow already uses Node `22.14.0`, installs a
SHA512-verified `npm@11.16.0` tarball, runs on `ubuntu-latest`, uses
`id-token: write`, disables package-manager caching for the publish job, and
publishes only from the canonical `eunjjang3/ograph` repository. It also
verifies that the package
name, package repository URL, GitHub repository context, and release tag match
the intended `@eunjjang/ograph` identity before npm publish can run. Release
events additionally require exactly one dated changelog heading for the
package version, an empty `## Unreleased` section, and a release tag commit
that is reachable from protected `origin/main`.

GitHub repository ruleset `Protect release tags` protects `v*` release tags
from deletion and non-fast-forward updates. Keep it active because GitHub
release events and `v*` tags are the publish trigger boundary.

## Release Procedure

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

4. Do not republish an already-published version. The manual first publish has
   already consumed `@eunjjang/ograph@0.1.0`; future npm publishes must bump
   `package.json` and changelog before tagging.

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
   npx -y npm@11.16.0 trust github @eunjjang/ograph \
     --repo eunjjang3/ograph \
     --file release.yml \
     --environment npm \
     --allow-publish
   npx -y npm@11.16.0 trust list @eunjjang/ograph
   ```

6. Restrict traditional token publishing after Trusted Publishing has been
   verified. In npm package settings, prefer requiring 2FA and disallowing
   tokens for publishing access.

7. Finalize the changelog in a reviewed commit for every future release. Move
   release notes out of `## Unreleased`, leave that section empty, and add
   exactly one dated heading matching the package version:

   ```md
   ## Unreleased

   ## 0.2.0 - 2026-06-05
   ```

   The release identity guard intentionally rejects a release event while notes
   remain under `## Unreleased`, the dated version heading is missing, or the
   package version already exists on npm.

8. Confirm the release tag ruleset is active, then create a `v*` tag and
   GitHub release only after the above gates are green. The tag must match the
   current `package.json` version, and that version must not already exist on
   npm.

   ```sh
   VERSION="$(node -p 'require("./package.json").version')"
   npm run lint
   npm run test
   npm run build
   npm run check:examples
   npm run verify:consumer:pinned
   npm run verify:consumer:floating
   if npm view "@eunjjang/ograph@${VERSION}" version >/dev/null 2>&1; then
     echo "@eunjjang/ograph@${VERSION} already exists on npm; bump the version before tagging."
     exit 1
   fi
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
