import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigPath } from '../config/path.js';
import { checkForUpdate } from './updater.js';
const AUTO_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_UPDATE_ENV = 'SSH_MCP_AUTO_UPDATE';
export function stateFilePath(configPath = getConfigPath()) {
    return path.join(path.dirname(configPath), 'update-state.json');
}
export function readAutoUpdateState(file) {
    try {
        if (!existsSync(file))
            return undefined;
        return JSON.parse(readFileSync(file, 'utf-8'));
    }
    catch {
        return undefined;
    }
}
export function writeAutoUpdateState(file, state) {
    try {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(state, null, 2));
    }
    catch {
        // State tracking is best-effort; never fail the CLI over it
    }
}
export function isThrottled(state, now = Date.now()) {
    return state !== undefined && now - state.lastCheckAt < AUTO_UPDATE_INTERVAL_MS;
}
/**
 * Loop-prevention + mode gating. Auto-update never runs for:
 * - `mcp` (long-lived server), `run-job` (detached runner), `update` itself
 * - `--json` invocations (machine consumers)
 * - SSH_MCP_AUTO_UPDATE=0|false|no|off
 */
export function shouldSkipAutoUpdate(argv, env) {
    const first = argv.find((a) => !a.startsWith('-'));
    if (first === 'mcp' || first === 'run-job' || first === 'update')
        return true;
    if (argv.includes('--json'))
        return true;
    const flag = env[AUTO_UPDATE_ENV]?.toLowerCase();
    return flag === '0' || flag === 'false' || flag === 'no' || flag === 'off';
}
function selfEntry() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.js');
}
/**
 * Forced background auto-update: at most once per interval, checks the
 * registry and spawns a detached `ssh-mcp update --auto` when a newer
 * version exists. The running process is unaffected; the next invocation
 * uses the new version. Never throws.
 */
export async function maybeAutoUpdate() {
    const file = stateFilePath();
    const state = readAutoUpdateState(file);
    const now = Date.now();
    if (isThrottled(state, now))
        return 'skipped:throttled';
    let check;
    try {
        check = await checkForUpdate();
    }
    catch {
        // Record the attempt so offline machines don't hammer the registry
        writeAutoUpdateState(file, { lastCheckAt: now });
        return 'skipped:error';
    }
    writeAutoUpdateState(file, { ...(state ?? {}), lastCheckAt: now });
    if (!check?.updateAvailable)
        return 'skipped:current';
    try {
        const child = spawn(process.execPath, [selfEntry(), 'update', '--auto'], {
            detached: true,
            stdio: 'ignore',
            env: process.env,
        });
        child.unref();
    }
    catch {
        return 'skipped:error';
    }
    writeAutoUpdateState(file, { lastCheckAt: now, lastSpawnedVersion: check.latestVersion });
    return 'spawned';
}
//# sourceMappingURL=auto-update.js.map