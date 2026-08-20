import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runCli } from '../../../src/cli/main.js';

const checkForUpdateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/cli/updater.js', () => ({
  checkForUpdate: checkForUpdateMock,
  selfUpdate: checkForUpdateMock,
}));

vi.mock('../../../src/cli/auto-update.js', () => ({
  maybeAutoUpdate: vi.fn(async () => 'skipped:current'),
  shouldSkipAutoUpdate: () => true,
}));

const ENTRY = path.resolve('dist/index.js');

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runEntry(args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, ...args], {
      env: {
        ...process.env,
        SSH_MCP_CONFIG: '/nonexistent/config.json',
        SSH_MCP_AUTO_UPDATE: '0',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('update nudge wiring (main.ts)', () => {
  let originalConfigEnv: string | undefined;
  let tmpConfig: string;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    tmpConfig = path.join(fs.mkdtempSync('/tmp/ssh-mcp-nudge-'), 'config.json');
    fs.writeFileSync(
      tmpConfig,
      JSON.stringify({
        servers: [
          {
            id: 'none',
            host: '127.0.0.1',
            port: 22,
            username: 'nobody',
            auth: { password: 'x' },
          },
        ],
      }),
    );
    fs.chmodSync(tmpConfig, 0o600);
    process.env.SSH_MCP_CONFIG = tmpConfig;
    if (!fs.existsSync(ENTRY)) {
      throw new Error('dist/index.js missing - run bun run build first');
    }
  });

  afterAll(() => {
    if (originalConfigEnv !== undefined) process.env.SSH_MCP_CONFIG = originalConfigEnv;
    else delete process.env.SSH_MCP_CONFIG;
    fs.rmSync(path.dirname(tmpConfig), { recursive: true, force: true });
  });

  describe('in-process (mocked registry)', () => {
    const nudgeSpy = vi.hoisted(() => vi.fn());
    vi.mock('../../../src/cli/commands/update.js', async (importOriginal) => {
      const original = (await importOriginal()) as Record<string, unknown>;
      return { ...original, notifyUpdate: nudgeSpy };
    });

    it('calls notifyUpdate for --help', async () => {
      nudgeSpy.mockClear();
      const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      await runCli(['--help']);
      exit.mockRestore();
      expect(nudgeSpy).toHaveBeenCalledTimes(1);
    });

    it('calls notifyUpdate for unknown commands', async () => {
      nudgeSpy.mockClear();
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      await runCli(['frobnicate']);
      exit.mockRestore();
      errSpy.mockRestore();
      expect(nudgeSpy).toHaveBeenCalledTimes(1);
    });

    it('does not call notifyUpdate for regular commands', async () => {
      nudgeSpy.mockClear();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await runCli(['servers']);
      logSpy.mockRestore();
      errSpy.mockRestore();
      expect(nudgeSpy).not.toHaveBeenCalled();
    });
  });

  describe('end-to-end (real binary, mocked registry via in-process harness)', () => {
    it('nudge does not corrupt --help output on stdout', async () => {
      const result = await runEntry(['--help']);
      expect(result.stdout).toContain('Usage:');
      // Nudge (if any) belongs on stderr only
      expect(result.stdout).not.toContain('is available');
    });
  });
});
