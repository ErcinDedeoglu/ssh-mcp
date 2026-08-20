import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NPM_PACKAGE = 'ssh-mcp-cli';

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export interface UpdateResult {
  fromVersion: string;
  toVersion: string;
  packageManager: 'npm' | 'bun';
  reinstalled: boolean;
}

function resolveInstalledVersion(): string {
  try {
    const pkgPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../package.json',
    );
    return JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function fetchLatestVersion(): Promise<string> {
  const url = `https://registry.npmjs.org/${NPM_PACKAGE}/latest`;
  return fetch(url, { headers: { accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error(`registry responded ${res.status}`);
      return res.json() as Promise<{ version?: string }>;
    })
    .then((body) => body.version ?? '0.0.0');
}

/** Compares the running install against the npm registry latest. */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = resolveInstalledVersion();
  const latestVersion = await fetchLatestVersion();
  return {
    currentVersion,
    latestVersion,
    updateAvailable: currentVersion !== latestVersion,
  };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

/**
 * Detects which package manager owns the global install.
 * bun if the running binary sits under bun's global dir, else npm.
 */
export function detectPackageManager(): 'npm' | 'bun' {
  const self = fileURLToPath(import.meta.url);
  return self.includes(`${path.sep}.bun${path.sep}`) || existsSync('/.bun/bin') ? 'bun' : 'npm';
}

function runUpgrade(packageManager: 'npm' | 'bun'): Promise<void> {
  const command = packageManager === 'bun' ? 'bun' : 'npm';
  const args =
    packageManager === 'bun'
      ? ['add', '-g', `${NPM_PACKAGE}@latest`]
      : ['install', '-g', `${NPM_PACKAGE}@latest`];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

/**
 * Self-update: installs the latest version with the detected package
 * manager. Reinstalls (no-op upgrade) when already current, so callers
 * can use it as `ssh-mcp update` unconditionally.
 */
export async function selfUpdate(): Promise<UpdateResult> {
  const fromVersion = resolveInstalledVersion();
  const packageManager = detectPackageManager();
  const latest = await fetchLatestVersion();
  const reinstall = compareVersions(fromVersion, latest) >= 0;

  await runUpgrade(packageManager);

  return {
    fromVersion,
    toVersion: latest,
    packageManager,
    reinstalled: reinstall,
  };
}
