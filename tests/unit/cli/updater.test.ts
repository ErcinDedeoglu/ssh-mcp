import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';

const fetchMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.stubGlobal('fetch', fetchMock);

const { checkForUpdate, selfUpdate, detectPackageManager } =
  await import('../../../src/cli/updater.js');

function childWith(code: number) {
  return {
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      if (event === 'close') setTimeout(() => cb(code), 0);
    }),
  };
}

describe('updater', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    spawnMock.mockReset();
  });

  describe('checkForUpdate', () => {
    it('reports update available when registry is newer', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: '9.9.9' }) });

      const result = await checkForUpdate();

      expect(result.latestVersion).toBe('9.9.9');
      expect(result.updateAvailable).toBe(true);
      expect(result.currentVersion).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('reports no update when versions match', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          version: JSON.parse(fs.readFileSync('package.json', 'utf-8')).version,
        }),
      });

      const result = await checkForUpdate();
      expect(result.updateAvailable).toBe(false);
    });

    it('rejects on registry error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(checkForUpdate()).rejects.toThrow('registry responded 500');
    });
  });

  describe('detectPackageManager', () => {
    it('returns npm or bun depending on install location', () => {
      const pm = detectPackageManager();
      expect(['npm', 'bun']).toContain(pm);
    });
  });

  describe('selfUpdate', () => {
    it('upgrades via npm when newer version exists', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: '99.0.0' }) });
      spawnMock.mockReturnValue(childWith(0));

      const result = await selfUpdate();

      expect(spawnMock).toHaveBeenCalledWith(
        'npm',
        ['install', '-g', 'ssh-mcp-cli@latest'],
        expect.anything(),
      );
      expect(result.toVersion).toBe('99.0.0');
      expect(result.reinstalled).toBe(false);
    });

    it('marks reinstall when already current', async () => {
      const version = JSON.parse(fs.readFileSync('package.json', 'utf-8')).version;
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version }) });
      spawnMock.mockReturnValue(childWith(0));

      const result = await selfUpdate();
      expect(result.reinstalled).toBe(true);
    });

    it('rejects when the package manager fails', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: '99.0.0' }) });
      spawnMock.mockReturnValue(childWith(1));

      await expect(selfUpdate()).rejects.toThrow('exited with code 1');
    });
  });
});
