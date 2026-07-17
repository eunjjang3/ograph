import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

for (const relativePath of ['dist/index.js', 'dist/chunks', 'dist/workers']) {
  rmSync(resolve(repoRoot, relativePath), { force: true, recursive: true });
}
