import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getReleaseIdentityIssues,
  getReleaseMainReachabilityIssues,
  getReleaseRegistryVersionIssues,
  verifyReleaseIdentity
} from '../scripts/verify-release-identity.mjs';

const validPackageJson = {
  name: '@eunjjang/ograph',
  version: '0.1.0',
  repository: {
    url: 'git+https://github.com/eunjjang3/ograph.git'
  }
};

const validReleaseChangelog = `# Changelog

## Unreleased

## 0.1.0 - 2026-06-04

- Initial public preview.
`;

const unreleasedCandidateChangelog = `# Changelog

## Unreleased

- Initial public preview candidate.
`;

function getThrownMessage(fn) {
  try {
    fn();
  } catch (error) {
    return error.message;
  }

  throw new Error('Expected function to throw');
}

test('release identity accepts workflow dispatch dry runs from main', () => {
  assert.doesNotThrow(() =>
    verifyReleaseIdentity(
      validPackageJson,
      {
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_REPOSITORY: 'eunjjang3/ograph'
      },
      unreleasedCandidateChangelog
    )
  );
});

test('release identity accepts release tags that match package version', () => {
  assert.deepEqual(
    getReleaseIdentityIssues(
      validPackageJson,
      {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/tags/v0.1.0',
        GITHUB_REPOSITORY: 'eunjjang3/ograph'
      },
      validReleaseChangelog
    ),
    []
  );
});

test('release identity accepts release tags whose commit is reachable from origin main', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return args[0] === 'rev-parse' ? 'main-commit' : '';
  };

  assert.doesNotThrow(() =>
    verifyReleaseIdentity(
      validPackageJson,
      {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/tags/v0.1.0',
        GITHUB_REPOSITORY: 'eunjjang3/ograph',
        GITHUB_SHA: 'release-commit'
      },
      validReleaseChangelog,
      { checkMainReachability: true, git }
    )
  );

  assert.deepEqual(calls, [
    ['fetch', '--quiet', 'origin', 'main:refs/remotes/origin/main'],
    ['rev-parse', '--verify', 'origin/main'],
    ['merge-base', '--is-ancestor', 'release-commit', 'origin/main']
  ]);
});

test('release identity rejects release tags that are not reachable from origin main', () => {
  const git = (args) => {
    if (args[0] === 'merge-base') {
      throw new Error('not an ancestor');
    }

    return '';
  };

  assert.deepEqual(
    getReleaseMainReachabilityIssues(
      {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/tags/v0.1.0',
        GITHUB_SHA: 'unreviewed-commit'
      },
      git
    ),
    ['release tag commit unreviewed-commit must be reachable from protected origin/main']
  );
});

test('release identity rejects release publishes without a commit sha for main reachability', () => {
  assert.deepEqual(
    getReleaseMainReachabilityIssues({
      GITHUB_EVENT_NAME: 'release',
      GITHUB_REF: 'refs/tags/v0.1.0'
    }),
    ['release publish requires GITHUB_SHA so the tag commit can be checked against origin/main']
  );
});

test('release identity accepts release tags when the npm version is unpublished', () => {
  const npm = () => {
    const error = new Error('E404 Not Found');
    error.stderr = 'npm error code E404\nnpm error 404 Not Found';
    throw error;
  };

  assert.deepEqual(
    getReleaseRegistryVersionIssues(
      validPackageJson,
      {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/tags/v0.1.0'
      },
      npm
    ),
    []
  );
});

test('release identity rejects release tags when the npm version already exists', () => {
  assert.deepEqual(
    getReleaseRegistryVersionIssues(
      validPackageJson,
      {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/tags/v0.1.0'
      },
      () => '"0.1.0"'
    ),
    [
      'npm package version @eunjjang/ograph@0.1.0 already exists; bump package.json and CHANGELOG.md before release publish'
    ]
  );
});

test('release identity surfaces unexpected npm registry lookup failures', () => {
  const npm = () => {
    const error = new Error('registry timeout');
    error.stderr = 'npm error code ETIMEDOUT';
    throw error;
  };

  assert.deepEqual(
    getReleaseRegistryVersionIssues(
      validPackageJson,
      {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/tags/v0.1.0'
      },
      npm
    ),
    ['could not verify npm package version availability for @eunjjang/ograph@0.1.0']
  );
});

test('release identity rejects tags that do not match package version', () => {
  assert.match(
    getThrownMessage(() =>
      verifyReleaseIdentity(
        validPackageJson,
        {
          GITHUB_EVENT_NAME: 'release',
          GITHUB_REF: 'refs/tags/v0.1.1',
          GITHUB_REPOSITORY: 'eunjjang3/ograph'
        },
        validReleaseChangelog
      )
    ),
    /expected v0\.1\.0, got v0\.1\.1/
  );
});

test('release identity rejects release publishes from non-tag refs', () => {
  assert.match(
    getThrownMessage(() =>
      verifyReleaseIdentity(
        validPackageJson,
        {
          GITHUB_EVENT_NAME: 'release',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'eunjjang3/ograph'
        },
        validReleaseChangelog
      )
    ),
    /requires a refs\/tags\/v\* ref/
  );
});

test('release identity rejects publishes outside the canonical GitHub repository', () => {
  assert.match(
    getThrownMessage(() =>
      verifyReleaseIdentity(
        validPackageJson,
        {
          GITHUB_EVENT_NAME: 'release',
          GITHUB_REF: 'refs/tags/v0.1.0',
          GITHUB_REPOSITORY: 'eunjjang3/ograph2'
        },
        validReleaseChangelog
      )
    ),
    /GITHUB_REPOSITORY must be eunjjang3\/ograph/
  );
});

test('release identity rejects publishes with unreleased changelog content', () => {
  const issues = getReleaseIdentityIssues(
    validPackageJson,
    {
      GITHUB_EVENT_NAME: 'release',
      GITHUB_REF: 'refs/tags/v0.1.0',
      GITHUB_REPOSITORY: 'eunjjang3/ograph'
    },
    unreleasedCandidateChangelog
  );

  assert.equal(issues.length, 2);
  assert.match(issues[0], /"## Unreleased" section must be empty/);
  assert.match(issues[1], /exactly one "## 0\.1\.0 - YYYY-MM-DD" heading/);
});

test('release identity rejects duplicate changelog version headings', () => {
  const duplicateReleaseChangelog = `${validReleaseChangelog}

## 0.1.0 - 2026-06-03

- Duplicate release entry.
`;

  assert.match(
    getThrownMessage(() =>
      verifyReleaseIdentity(
        validPackageJson,
        {
          GITHUB_EVENT_NAME: 'release',
          GITHUB_REF: 'refs/tags/v0.1.0',
          GITHUB_REPOSITORY: 'eunjjang3/ograph'
        },
        duplicateReleaseChangelog
      )
    ),
    /exactly one "## 0\.1\.0 - YYYY-MM-DD" heading/
  );
});

test('release identity rejects stale package and repository names', () => {
  const issues = getReleaseIdentityIssues(
    {
      ...validPackageJson,
      name: '@afterglow/ograph',
      repository: {
        url: 'git+https://github.com/eunjjang3/ograph2.git'
      }
    },
    {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'eunjjang3/ograph'
    }
  );

  assert.equal(issues.length, 2);
  assert.match(issues[0], /@eunjjang\/ograph/);
  assert.match(issues[1], /eunjjang3\/ograph/);
});
