import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const checkForUpdateMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('../../../src/cli/updater.js', () => ({ checkForUpdate: checkForUpdateMock }));

const { isThrottled, shouldSkipAutoUpdate, maybeAutoUpdate, readAutoUpdateState, stateFilePath } =
  await import('../../../src/cli/auto-update.js');

function makeChild() {
  return { on: vi.fn(), unref: vi.fn() };
}

describe('auto-update', () => {
  let dir: string;
  let configPath: string;
  let originalConfig: string | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-auto-'));
    configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, '{}');
    originalConfig = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = configPath;
    checkForUpdateMock.mockReset();
    spawnMock.mockReset();
    spawnMock.mockReturnValue(makeChild());
  });

  afterEach(() => {
    if (originalConfig !== undefined) process.env.SSH_MCP_CONFIG = originalConfig;
    else delete process.env.SSH_MCP_CONFIG;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('isThrottled', () => {
    it('is throttled when the last check is recent', () => {
      expect(isThrottled({ lastCheckAt: Date.now() - 1000 })).toBe(true);
    });

    it('is not throttled when state is missing or stale', () => {
      expect(isThrottled(undefined)).toBe(false);
      expect(isThrottled({ lastCheckAt: Date.now() - 25 * 60 * 60 * 1000 })).toBe(false);
    });
  });

  describe('shouldSkipAutoUpdate', () => {
    const env = {};

    it('skips mcp, run-job, and update itself (loop prevention)', () => {
      expect(shouldSkipAutoUpdate(['mcp'], env)).toBe(true);
      expect(shouldSkipAutoUpdate(['run-job', 'x', 'y', '--', 'cmd'], env)).toBe(true);
      expect(shouldSkipAutoUpdate(['update'], env)).toBe(true);
      expect(shouldSkipAutoUpdate(['update', '--auto'], env)).toBe(true);
    });

    it('skips --json invocations', () => {
      expect(shouldSkipAutoUpdate(['servers', '--json'], env)).toBe(true);
    });

    it('respects SSH_MCP_AUTO_UPDATE opt-out values', () => {
      for (const value of ['0', 'false', 'no', 'off', 'FALSE']) {
        expect(shouldSkipAutoUpdate(['servers'], { SSH_MCP_AUTO_UPDATE: value })).toBe(true);
      }
      expect(shouldSkipAutoUpdate(['servers'], { SSH_MCP_AUTO_UPDATE: '1' })).toBe(false);
    });

    it('runs for regular interactive commands', () => {
      expect(shouldSkipAutoUpdate(['servers'], env)).toBe(false);
      expect(shouldSkipAutoUpdate(['exec', 'srv', 'ls'], env)).toBe(false);
    });
  });

  describe('maybeAutoUpdate', () => {
    it('does nothing while throttled', async () => {
      fs.writeFileSync(stateFilePath(), JSON.stringify({ lastCheckAt: Date.now() }));

      const action = await maybeAutoUpdate();

      expect(action).toBe('skipped:throttled');
      expect(checkForUpdateMock).not.toHaveBeenCalled();
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('spawns a detached silent updater when a newer version exists', async () => {
      checkForUpdateMock.mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateAvailable: true,
      });

      const action = await maybeAutoUpdate();

      expect(action).toBe('spawned');
      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [execPath, args, options] = spawnMock.mock.calls[0];
      expect(execPath).toBe(process.execPath);
      expect(args[0]).toMatch(/index\.js$/);
      expect(args[1]).toBe('update');
      expect(args[2]).toBe('--auto');
      expect(options).toMatchObject({ detached: true, stdio: 'ignore' });

      const state = readAutoUpdateState(stateFilePath());
      expect(state?.lastSpawnedVersion).toBe('2.0.0');
      expect(state?.lastCheckAt).toBeGreaterThan(0);
    });

    it('does not spawn when already current', async () => {
      checkForUpdateMock.mockResolvedValue({
        currentVersion: '2.0.0',
        latestVersion: '2.0.0',
        updateAvailable: false,
      });

      const action = await maybeAutoUpdate();

      expect(action).toBe('skipped:current');
      expect(spawnMock).not.toHaveBeenCalled();
      expect(readAutoUpdateState(stateFilePath())?.lastCheckAt).toBeGreaterThan(0);
    });

    it('records the attempt and stays silent on registry errors', async () => {
      checkForUpdateMock.mockRejectedValue(new Error('ENOTFOUND'));

      const action = await maybeAutoUpdate();

      expect(action).toBe('skipped:error');
      expect(spawnMock).not.toHaveBeenCalled();
      expect(readAutoUpdateState(stateFilePath())?.lastCheckAt).toBeGreaterThan(0);
    });

    it('never throws when checkForUpdate misbehaves', async () => {
      checkForUpdateMock.mockResolvedValue(undefined);

      await expect(maybeAutoUpdate()).resolves.toBe('skipped:current');
    });

    it('throttles the next call after a completed check', async () => {
      checkForUpdateMock.mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        updateAvailable: false,
      });

      await maybeAutoUpdate();
      const action = await maybeAutoUpdate();

      expect(action).toBe('skipped:throttled');
      expect(checkForUpdateMock).toHaveBeenCalledTimes(1);
    });

    it('reports skipped:error when spawning the updater child throws', async () => {
      checkForUpdateMock.mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateAvailable: true,
      });
      spawnMock.mockImplementation(() => {
        throw new Error('EAGAIN');
      });

      const action = await maybeAutoUpdate();

      expect(action).toBe('skipped:error');
      // lastCheckAt recorded, but no lastSpawnedVersion since spawn failed
      const state = readAutoUpdateState(stateFilePath());
      expect(state?.lastCheckAt).toBeGreaterThan(0);
      expect(state?.lastSpawnedVersion).toBeUndefined();
    });

    it('treats a corrupt state file as no state (fresh check)', async () => {
      fs.writeFileSync(stateFilePath(), '{not valid json');
      checkForUpdateMock.mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        updateAvailable: false,
      });

      const action = await maybeAutoUpdate();

      expect(action).toBe('skipped:current');
      // And the corrupt file is replaced with valid state
      expect(readAutoUpdateState(stateFilePath())?.lastCheckAt).toBeGreaterThan(0);
    });
  });
});
