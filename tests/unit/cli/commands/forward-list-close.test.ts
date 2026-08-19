import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const buildCliDepsMock = vi.hoisted(() => vi.fn());
const cleanupCliMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/cli/context.js', () => ({
  buildCliDeps: buildCliDepsMock,
  cleanupCli: cleanupCliMock,
}));

const { registerForwardCommands } = await import('../../../../src/cli/commands/forward.js');
const { captureConsole, runCapturingExit } = await import('../_fixtures/cli-command.helpers.js');
const { ForwardStore } = await import('../../../../src/cli/forward-store.js');

describe('forwards list / close command handlers', () => {
  let cap: ReturnType<typeof captureConsole>;
  let dir: string;
  let store: InstanceType<typeof ForwardStore>;
  let originalConfig: string | undefined;

  beforeEach(() => {
    cap = captureConsole();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-fwdcmd-'));
    store = new ForwardStore(path.join(dir, 'forwards.json'));
    originalConfig = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = path.join(dir, 'config.json');
    buildCliDepsMock.mockReset();
    cleanupCliMock.mockReset();
  });

  afterEach(() => {
    cap.restore();
    if (originalConfig !== undefined) process.env.SSH_MCP_CONFIG = originalConfig;
    else delete process.env.SSH_MCP_CONFIG;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('forwards (list)', () => {
    it('prints live entries with kind, server, route and pid', async () => {
      store.add({
        kind: 'local',
        serverId: 's',
        localHost: '127.0.0.1',
        localPort: 15432,
        remoteHost: 'db',
        remotePort: 5432,
        pid: process.pid,
        createdAt: Date.now(),
      });

      await runCapturingExit(registerForwardCommands, ['forwards']);

      const out = cap.logs.join('');
      expect(out).toContain('local');
      expect(out).toContain('s');
      expect(out).toContain('127.0.0.1:15432 -> db:5432');
      expect(out).toContain(`pid ${process.pid}`);
    });

    it('prints empty hint when none active', async () => {
      await runCapturingExit(registerForwardCommands, ['forwards']);
      expect(cap.logs.join('')).toContain('No active forwards.');
    });

    it('--json prints the raw entries', async () => {
      store.add({
        kind: 'remote',
        serverId: 's',
        remoteHost: '127.0.0.1',
        remotePort: 8080,
        localHost: 'localhost',
        localPort: 3000,
        pid: process.pid,
        createdAt: Date.now(),
      });

      await runCapturingExit(registerForwardCommands, ['forwards', '--json']);

      const parsed = JSON.parse(cap.logs.join('')) as Array<{ kind: string }>;
      expect(parsed[0].kind).toBe('remote');
    });
  });

  describe('forward-close', () => {
    it('exits 1 when no forward matches', async () => {
      const code = await runCapturingExit(registerForwardCommands, ['forward-close', '9999']);

      expect(cap.errors.join('')).toContain('No matching active forward');
      expect(code).toBe(1);
    });

    it('signals the owner process of a matching forward', async () => {
      // Real disposable child that exits on SIGINT - proves the signal is delivered
      const child = spawn(process.execPath, [
        '-e',
        'process.on("SIGINT", () => process.exit(0)); process.stdout.write("ready"); setInterval(() => {}, 1000);',
      ]);
      const exited = new Promise<number>((resolve) => child.on('exit', (c) => resolve(c ?? -1)));
      const ready = new Promise<void>((resolve) => {
        child.stdout.on('data', () => resolve());
      });
      await ready;

      store.add({
        kind: 'local',
        serverId: 's',
        localHost: '127.0.0.1',
        localPort: 25000,
        remoteHost: 'db',
        remotePort: 5432,
        pid: child.pid!,
        createdAt: Date.now(),
      });

      const code = await runCapturingExit(registerForwardCommands, ['forward-close', '25000']);

      expect(cap.logs.join('')).toContain(`Signaled owner process ${child.pid}`);
      expect(code ?? 0).toBe(0);
      expect(await exited).toBe(0);
    });
  });

  describe('rforward-close', () => {
    it('exits 1 when no remote forward matches', async () => {
      const code = await runCapturingExit(registerForwardCommands, ['rforward-close', 's', '8080']);

      expect(cap.errors.join('')).toContain('No matching active forward');
      expect(code).toBe(1);
    });
  });
});
