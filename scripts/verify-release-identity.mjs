import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedPackageName = '@eunjjang/ograph';
const expectedRepositoryUrl = 'git+https://github.com/eunjjang3/ograph.git';
const expectedGitHubRepository = 'eunjjang3/ograph';

export function getReleaseIdentityIssues(packageJson, env = process.env) {
  const issues = [];

  if (packageJson.name !== expectedPackageName) {
    issues.push(`package name must be ${expectedPackageName}, got ${packageJson.name ?? '<missing>'}`);
  }

  if (packageJson.repository?.url !== expectedRepositoryUrl) {
    issues.push(
      `repository.url must be ${expectedRepositoryUrl}, got ${packageJson.repository?.url ?? '<missing>'}`
    );
  }

  const githubRepository = env.GITHUB_REPOSITORY;

  if (githubRepository && githubRepository !== expectedGitHubRepository) {
    issues.push(`GITHUB_REPOSITORY must be ${expectedGitHubRepository}, got ${githubRepository}`);
  }

  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    issues.push('package version must be a non-empty string');
  }

  const githubRef = env.GITHUB_REF ?? '';
  const eventName = env.GITHUB_EVENT_NAME ?? '';
  const isReleasePublish = eventName === 'release' || githubRef.startsWith('refs/tags/');

  if (isReleasePublish) {
    if (!githubRef.startsWith('refs/tags/v')) {
      issues.push(`release publish requires a refs/tags/v* ref, got ${githubRef || '<missing>'}`);
    } else {
      const tagName = githubRef.slice('refs/tags/'.length);
      const expectedTagName = `v${packageJson.version}`;

      if (tagName !== expectedTagName) {
        issues.push(`release tag must match package version: expected ${expectedTagName}, got ${tagName}`);
      }
    }
  }

  return issues;
}

export function verifyReleaseIdentity(packageJson, env = process.env) {
  const issues = getReleaseIdentityIssues(packageJson, env);

  if (issues.length > 0) {
    throw new Error(`Release identity check failed:\n- ${issues.join('\n- ')}`);
  }
}

function readPackageJson() {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyReleaseIdentity(readPackageJson());
}
