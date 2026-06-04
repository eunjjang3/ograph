import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getReleaseIdentityIssues,
  verifyReleaseIdentity
} from '../scripts/verify-release-identity.mjs';

const validPackageJson = {
  name: '@eunjjang/ograph',
  version: '0.1.0',
  repository: {
    url: 'git+https://github.com/eunjjang3/ograph.git'
  }
};

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
    verifyReleaseIdentity(validPackageJson, {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'eunjjang3/ograph'
    })
  );
});

test('release identity accepts release tags that match package version', () => {
  assert.deepEqual(
    getReleaseIdentityIssues(validPackageJson, {
      GITHUB_EVENT_NAME: 'release',
      GITHUB_REF: 'refs/tags/v0.1.0',
      GITHUB_REPOSITORY: 'eunjjang3/ograph'
    }),
    []
  );
});

test('release identity rejects tags that do not match package version', () => {
  assert.match(
    getThrownMessage(() =>
      verifyReleaseIdentity(validPackageJson, {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/tags/v0.1.1',
        GITHUB_REPOSITORY: 'eunjjang3/ograph'
      })
    ),
    /expected v0\.1\.0, got v0\.1\.1/
  );
});

test('release identity rejects release publishes from non-tag refs', () => {
  assert.match(
    getThrownMessage(() =>
      verifyReleaseIdentity(validPackageJson, {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_REPOSITORY: 'eunjjang3/ograph'
      })
    ),
    /requires a refs\/tags\/v\* ref/
  );
});

test('release identity rejects publishes outside the canonical GitHub repository', () => {
  assert.match(
    getThrownMessage(() =>
      verifyReleaseIdentity(validPackageJson, {
        GITHUB_EVENT_NAME: 'release',
        GITHUB_REF: 'refs/tags/v0.1.0',
        GITHUB_REPOSITORY: 'eunjjang3/ograph2'
      })
    ),
    /GITHUB_REPOSITORY must be eunjjang3\/ograph/
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
