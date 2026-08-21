import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedRoot: string | undefined;

function isOurPackageJson(file: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf-8')) as { name?: string };
    return pkg.name === 'ssh-mcp-cli';
  } catch {
    return false;
  }
}

/**
 * Resolves this package's root directory (the one holding its package.json).
 * Works in every layout: src/ (tests), tsc dist/ tree, and the flat esbuild
 * bundle - by walking up from the current file until our package.json is found.
 * Falls back to the directory above the current file's location.
 */
export function resolvePackageRoot(): string {
  if (cachedRoot) return cachedRoot;

  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, 'package.json');
    if (existsSync(candidate) && isOurPackageJson(candidate)) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback: one level above this module's location
  cachedRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  return cachedRoot;
}

/** Absolute path to a file shipped inside this package (e.g. 'skills/ssh-mcp-cli/SKILL.md'). */
export function packagePath(...segments: string[]): string {
  return path.join(resolvePackageRoot(), ...segments);
}
