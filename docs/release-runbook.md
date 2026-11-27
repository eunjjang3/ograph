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
The registry's `latest` release is `0.4.1`, verified on 2026-11-28 KST.
Versions `0.1.0`, `0.2.0`, `0.3.0`, `0.3.1`, and `0.4.0` remain consumed
historical releases. Current releases use npm Trusted Publishing through the
GitHub release workflow.

Current registry and release evidence from 2026-11-28 KST:

- Registry `latest` and `npm view @eunjjang/ograph version` both report `0.4.1`.
- GitHub release/tag `v0.4.1` and npm `gitHead` identify the same main commit:
  `94eae75166448a98dfc97ac289c873f895e4f992`.
- Release workflow [46072049025](https://github.com/eunjjang3/ograph/actions/runs/46072049025)
  succeeded after the configured `npm` environment approval. Publishing used
  OIDC Trusted Publishing; no local token publish or repeat publish was used.
- The public package contains 21 files, two registry signatures, and an SLSA
  provenance attestation.
- A fresh React 19 / TypeScript 5 registry consumer installed `0.4.1`, verified
  all five runtime exports and motion defaults, and typechecked `autoFit`,
  `setCameraFollowNodeId`, tooltip styling/hiding, and typed custom tooltip UI.
- `npm audit signatures` verified 24 installed package signatures and 11
  attestations in that consumer fixture.
- CI `46070121139`, CodeQL `46070121100`, and Scorecard `46070121307` passed
  on the release commit before tagging. PRs #99, #100, and #101 are included.
- The release browser gate reported 17 passed and one flaky test: the Canvas/main
  camera-control check initially observed zoom `0.8` instead of `1.75`, then
  passed its configured retry. This observation is retained for follow-up;
  the successful workflow does not mean every test passed on its first attempt.
- The initial registry version lookup returned 404 after publishing. Subsequent
  metadata and fresh installation checks succeeded without rerunning publication.

Historical 0.4.0 registry and release evidence from 2026-11-16 KST:

- `npm view @eunjjang/ograph version --json` returns `0.4.0`.
- `npm view @eunjjang/ograph dist-tags --json` points `latest` at `0.4.0`.
- GitHub release `v0.4.0` and protected tag `v0.4.0` resolve to commit
  `1bd8659c11cbbe4d2ee28fac82f4961164445933` on `main`, matching npm `gitHead`.
- Release workflow run `43878584204` completed successfully after the required
  `npm` environment approval and published through OIDC Trusted Publishing.
- The release commit passed CI `43878066127`, CodeQL `43878066441`, and
  Scorecard `43878066285` before tagging. Release preparation PR #91 and
  graph motion PR #90 are merged.
- `npm access get status @eunjjang/ograph --json` returns `public`.
- `npm view @eunjjang/ograph@0.4.0 dist --json` reports 21 files, two registry
  signatures, and an SLSA provenance attestation.
- A fresh React 19 / TypeScript 5 consumer installed `@eunjjang/ograph@0.4.0`
  from npm and verified runtime exports, all four motion profiles, partial
  preset typing, and resolved physical defaults. `npm audit signatures`
  verified 24 installed package signatures and 10 attestations in that fixture.
- npm initially reported that the package was being processed. Registry version,
  `latest`, installation, and provenance were checked after it became available;
  the publish workflow was not rerun.
- GitHub repository ruleset `Protect release tags` (`17266129`) is active for
  `refs/tags/v*` and blocks deletion and non-fast-forward updates without
  bypass actors.
- `main` branch protection enforces required checks for administrators, so
  release-prep changes must land through a checked branch/PR path rather than
  admin direct-push bypass.

## Trusted Publishing Requirements

npm Trusted Publishing uses OIDC between npm and the CI provider. For this
repository, the required release shape is:

- npm CLI `11.5.1` or newer for OIDC publish; the workflow extracts
  `npm@11.16.0` from a SHA512-verified tarball and uses that CLI only for
  npm publish commands.
- npm CLI `11.16.0` or newer for `npm trust` configuration commands that set
  allowed actions.
- Node.js `22.14.0` or newer.
- GitHub-hosted runner, not a self-hosted runner.
- Workflow job permission `id-token: write`.
- Public GitHub repository and public package.
- `package.json` `repository.url` matching `github.com/eunjjang3/ograph`.
- A Trusted Publisher configured for GitHub Actions on npmjs.com or with
  `npm trust`.

The existing release workflow already uses Node `22.14.0`, extracts a
SHA512-verified `npm@11.16.0` tarball for publish commands, runs on
`ubuntu-latest`, uses `id-token: write`, disables package-manager caching for
the publish job, and publishes only from the canonical `eunjjang3/ograph`
repository. It also verifies that the package
name, package repository URL, GitHub repository context, and release tag match
the intended `@eunjjang/ograph` identity before npm publish can run. Release
events additionally require exactly one dated changelog heading for the
package version, an empty `## Unreleased` section, and a release tag commit
that is reachable from protected `origin/main`.

GitHub repository ruleset `Protect release tags` protects `v*` release tags
from deletion and non-fast-forward updates. Keep it active because GitHub
release events and `v*` tags are the publish trigger boundary.

## Version Selection

Use the [versioning policy](../CONTRIBUTING.md#versioning-policy) before preparing
a release. For `0.x`, compatible fixes and optional API additions use a patch;
consumer migration requires a minor release with migration notes. From `1.0.0`,
use standard SemVer. Check consumer code, types, defaults, runtime requirements,
and peer ranges before classifying the change. Keep historical release evidence
unchanged when selecting the next version.

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

4. Do not republish an already-published version. Always query the registry
   before tagging; as of 2026-07-18, versions `0.1.0` and `0.2.0` are consumed.
   Future npm publishes must bump `package.json` and changelog before tagging.

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

   ## X.Y.Z - YYYY-MM-DD
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

11. Refresh the current release evidence in this runbook and
    `docs/hardening-roadmap.md` through a checked follow-up PR. Preserve dated
    baseline entries, prior changelog sections, and release-identity fixtures
    as historical evidence instead of replacing every old version string.

## Do Not

- Do not publish with a long-lived `NPM_TOKEN` while Trusted Publishing is the
  selected release policy.
- Do not bypass the GitHub `npm` environment approval for real publishes.
- Do not add a Scorecard badge until the score is high enough to be a useful
  public trust signal.
- Do not publish stable releases before the packed Playwright consumer gate is
  green in CI.
