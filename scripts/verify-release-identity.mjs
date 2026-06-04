import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedPackageName = '@eunjjang/ograph';
const expectedRepositoryUrl = 'git+https://github.com/eunjjang3/ograph.git';
const expectedGitHubRepository = 'eunjjang3/ograph';

function isReleasePublish(env) {
  const githubRef = env.GITHUB_REF ?? '';
  const eventName = env.GITHUB_EVENT_NAME ?? '';

  return eventName === 'release' || githubRef.startsWith('refs/tags/');
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function runNpm(args) {
  return execFileSync('npm', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function getMarkdownSectionBody(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);

  if (headingIndex === -1) {
    return null;
  }

  const bodyLines = [];

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      break;
    }

    bodyLines.push(lines[index]);
  }

  return bodyLines.join('\n').trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getReleaseChangelogIssues(packageJson, changelog, env = process.env) {
  if (!isReleasePublish(env)) {
    return [];
  }

  if (typeof changelog !== 'string' || changelog.length === 0) {
    return ['CHANGELOG.md must be readable for release publishes'];
  }

  const issues = [];
  const unreleasedBody = getMarkdownSectionBody(changelog, 'Unreleased');

  if (unreleasedBody === null) {
    issues.push('CHANGELOG.md must contain a "## Unreleased" section');
  } else if (unreleasedBody.length > 0) {
    issues.push('CHANGELOG.md "## Unreleased" section must be empty before release publish');
  }

  if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
    const versionPattern = new RegExp(
      `^## ${escapeRegex(packageJson.version)} - \\d{4}-\\d{2}-\\d{2}$`,
      'gm'
    );
    const releaseHeadings = changelog.match(versionPattern) ?? [];

    if (releaseHeadings.length !== 1) {
      issues.push(
        `CHANGELOG.md must contain exactly one "## ${packageJson.version} - YYYY-MM-DD" heading for release publish`
      );
    }
  }

  return issues;
}

export function getReleaseMainReachabilityIssues(env = process.env, git = runGit) {
  if (!isReleasePublish(env)) {
    return [];
  }

  const githubSha = env.GITHUB_SHA ?? '';

  if (githubSha.length === 0) {
    return ['release publish requires GITHUB_SHA so the tag commit can be checked against origin/main'];
  }

  try {
    git(['fetch', '--quiet', 'origin', 'main:refs/remotes/origin/main']);
    git(['rev-parse', '--verify', 'origin/main']);
    git(['merge-base', '--is-ancestor', githubSha, 'origin/main']);
    return [];
  } catch {
    return [`release tag commit ${githubSha} must be reachable from protected origin/main`];
  }
}

export function getReleaseRegistryVersionIssues(packageJson, env = process.env, npm = runNpm) {
  if (!isReleasePublish(env)) {
    return [];
  }

  if (typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
    return ['package name must be known before checking npm release availability'];
  }

  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    return ['package version must be known before checking npm release availability'];
  }

  const packageVersion = `${packageJson.name}@${packageJson.version}`;

  try {
    const publishedVersion = npm(['view', packageVersion, 'version', '--json']);

    if (publishedVersion.length > 0) {
      return [
        `npm package version ${packageVersion} already exists; bump package.json and CHANGELOG.md before release publish`
      ];
    }
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n');

    if (/E404|404 Not Found|not found/i.test(output)) {
      return [];
    }

    return [`could not verify npm package version availability for ${packageVersion}`];
  }

  return [];
}

export function getReleaseIdentityIssues(packageJson, env = process.env, changelog = '', options = {}) {
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

  if (isReleasePublish(env)) {
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

  issues.push(...getReleaseChangelogIssues(packageJson, changelog, env));

  if (options.checkMainReachability === true) {
    issues.push(...getReleaseMainReachabilityIssues(env, options.git ?? runGit));
  }

  if (options.checkRegistryVersion === true) {
    issues.push(...getReleaseRegistryVersionIssues(packageJson, env, options.npm ?? runNpm));
  }

  return issues;
}

export function verifyReleaseIdentity(packageJson, env = process.env, changelog = '', options = {}) {
  const issues = getReleaseIdentityIssues(packageJson, env, changelog, options);

  if (issues.length > 0) {
    throw new Error(`Release identity check failed:\n- ${issues.join('\n- ')}`);
  }
}

function readPackageJson() {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
}

function readChangelog() {
  return readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyReleaseIdentity(readPackageJson(), process.env, readChangelog(), {
    checkMainReachability: true,
    checkRegistryVersion: true
  });
}
