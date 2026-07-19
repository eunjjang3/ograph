import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = join(repoRoot, 'tests', 'fixtures', 'next-consumer');
const tempRoot = join(repoRoot, '.tmp');
const fixtureRoot = join(tempRoot, 'next-browser-consumer');
const packDir = join(tempRoot, 'next-browser-pack');

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    env: process.env
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function prepareNextBrowserConsumerFixture() {
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });
  cpSync(templateRoot, fixtureRoot, { recursive: true });

  run('npm', ['pack', '--pack-destination', packDir]);

  const tarballs = readdirSync(packDir).filter(file => file.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball, found ${tarballs.length}.`);
  }

  const packagePath = join(fixtureRoot, 'package.json');
  const fixturePackage = JSON.parse(readFileSync(packagePath, 'utf8'));
  const tarballPath = join(packDir, tarballs[0]);
  fixturePackage.dependencies['@eunjjang/ograph'] = `file:${relative(fixtureRoot, tarballPath)}`;
  writeJson(packagePath, fixturePackage);

  run('npm', ['install', '--silent', '--no-audit', '--no-fund', '--package-lock=false'], {
    cwd: fixtureRoot
  });
  run('npm', ['run', 'build'], { cwd: fixtureRoot });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepareNextBrowserConsumerFixture();
}
