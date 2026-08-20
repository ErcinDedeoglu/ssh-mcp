import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
export const NPM_PACKAGE = 'ssh-mcp-cli';
function resolveInstalledVersion() {
    try {
        const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
        return JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
function fetchLatestVersion() {
    const url = `https://registry.npmjs.org/${NPM_PACKAGE}/latest`;
    return fetch(url, { headers: { accept: 'application/json' } })
        .then((res) => {
        if (!res.ok)
            throw new Error(`registry responded ${res.status}`);
        return res.json();
    })
        .then((body) => body.version ?? '0.0.0');
}
/** Compares the running install against the npm registry latest. */
export async function checkForUpdate() {
    const currentVersion = resolveInstalledVersion();
    const latestVersion = await fetchLatestVersion();
    return {
        currentVersion,
        latestVersion,
        updateAvailable: currentVersion !== latestVersion,
    };
}
function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da !== db)
            return da < db ? -1 : 1;
    }
    return 0;
}
/**
 * Detects which package manager owns the global install.
 * bun if the running binary sits under bun's global dir, else npm.
 */
export function detectPackageManager() {
    const self = fileURLToPath(import.meta.url);
    return self.includes(`${path.sep}.bun${path.sep}`) || existsSync('/.bun/bin') ? 'bun' : 'npm';
}
function runUpgrade(packageManager) {
    const command = packageManager === 'bun' ? 'bun' : 'npm';
    const args = packageManager === 'bun'
        ? ['add', '-g', `${NPM_PACKAGE}@latest`]
        : ['install', '-g', `${NPM_PACKAGE}@latest`];
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit' });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`${command} exited with code ${code}`));
        });
    });
}
/**
 * Self-update: installs the latest version with the detected package
 * manager. Reinstalls (no-op upgrade) when already current, so callers
 * can use it as `ssh-mcp update` unconditionally.
 */
export async function selfUpdate() {
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
//# sourceMappingURL=updater.js.map