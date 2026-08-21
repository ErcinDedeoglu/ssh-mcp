/**
 * Bundles dist/index.js (tsc output) into a single self-contained ESM file
 * so the published tarball has zero runtime dependencies - npm 12 users get
 * no install-script warnings and installs are faster.
 */
import { execSync } from 'node:child_process';
import { readdirSync, renameSync, rmSync } from 'node:fs';

const BANNER = [
  'import { createRequire as __cr } from "node:module";',
  'import { fileURLToPath as __fu } from "node:url";',
  'import * as __path from "node:path";',
  'const require = __cr(import.meta.url);',
  'const __dirname = __path.dirname(__fu(import.meta.url));',
  'const __filename = __fu(import.meta.url);',
].join(' ');

execSync(
  [
    'npx esbuild dist/index.js',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node22',
    '--outfile=dist/.bundle-body.js',
    '--external:cpu-features',
    '--external:*.node',
    `--banner:js='${BANNER}'`,
  ].join(' '),
  { stdio: 'inherit' },
);

// tsc already preserved the shebang from src/index.ts at the top of its output;
// esbuild keeps it. The body already starts with it - nothing to prepend.
renameSync('dist/.bundle-body.js', 'dist/index.js');

// Single-file bundle: drop the tsc module tree and stale type declarations
// (the CLI is the public surface; no subpath API is promised)
for (const dir of ['cli', 'actions', 'tools', 'ssh', 'config', 'utils']) {
  rmSync(`dist/${dir}`, { recursive: true, force: true });
}
for (const file of [
  'server.js',
  'server-entry.js',
  'server.d.ts',
  'server-entry.d.ts',
  'index.d.ts',
]) {
  rmSync(`dist/${file}`, { force: true });
}
// All leftover sourcemaps of removed files
for (const f of readdirSync('dist')) {
  if (f.endsWith('.map')) rmSync(`dist/${f}`, { force: true });
}
