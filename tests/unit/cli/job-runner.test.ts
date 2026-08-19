import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ensureConnectedMock = vi.hoisted(() => vi.fn());
const getOrCreateShellMock = vi.hoisted(() => vi.fn());
const cleanupCliMock = vi.hoisted(() => vi.fn());
const buildCliDepsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/actions/ensure-connected.js', () => ({
  ensureConnected: ensureConnectedMock,
}));
vi.mock('../../../src/actions/shell-helpers.js', () => ({
  getOrCreateShell: getOrCreateShellMock,
  resolveTimeoutMs: () => 60000,
  resolveStallTimeoutMs: (v: number | null) => (v === null ? null : v * 1000),
}));
vi.mock('../../../src/cli/context.js', () => ({
  buildCliDeps: buildCliDepsMock,
  cleanupCli: cleanupCliMock,
}));

const shellExecuteMock = vi.hoisted(() => vi.fn());

import type { FakeDeps } from './_fixtures/job-runner.helpers.js';
import type { ShellRegistry } from '../../../src/ssh/shell-registry.js';

const { runJob } = await import('../../../src/cli/job-runner.js');
const { JobStore } = await import('../../../src/ssh/job-store.js');
const { makeRunnerDeps } = await import('./_fixtures/job-runner.helpers.js');

function makeDeps(dir: string): FakeDeps {
  return makeRunnerDeps(dir);
}

describe('runJob (detached runner)', () => {
  let dir: string;
  let store: InstanceType<typeof JobStore>;
  let deps: FakeDeps;
  let signalHandlers: Map<string, () => void>;
  let originalExit: typeof process.exit;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-runner-'));
    store = new JobStore(dir);
    deps = makeDeps(dir);
    buildCliDepsMock.mockReset();
    buildCliDepsMock.mockReturnValue(deps);
    signalHandlers = new Map();
    vi.spyOn(process, 'on').mockImplementation(
      (event: string | symbol, handler: (...args: unknown[]) => void) => {
        if (event === 'SIGTERM' || event === 'SIGINT') {
          signalHandlers.set(event as string, handler as () => void);
        }
        return process;
      },
    );
    originalExit = process.exit;
    process.exit = vi.fn() as never;
    ensureConnectedMock.mockReset();
    getOrCreateShellMock.mockReset();
    shellExecuteMock.mockReset();
    cleanupCliMock.mockReset();
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function mockConnected(): void {
    ensureConnectedMock.mockResolvedValue({
      success: true,
      session: { client: {}, touch: vi.fn() },
      serverConfig: { shell: 'auto' },
    });
  }

  it('marks the job running with its pid immediately', async () => {
    mockConnected();
    getOrCreateShellMock.mockImplementation(
      async (_id: string, _c: unknown, reg: ShellRegistry) => {
        const shell = {
          execute: shellExecuteMock,
          isReady: true,
          hasRunningCommand: false,
          cancelCurrentCommand: vi.fn(),
        };
        reg.set('srv', shell as never);
        return { shell, recreated: false };
      },
    );
    shellExecuteMock.mockImplementation(
      (_cmd: string, opts: { onOutput?: (c: string) => void }) =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ stdout: 'done', stderr: '', exitCode: 0 }), 30);
          opts.onOutput?.('partial ');
        }),
    );

    const code = await runJob('job_run1', 'srv', 'echo done', {});

    expect(code).toBe(0);
    const meta = store.read('job_run1');
    expect(meta).toMatchObject({ status: 'completed', pid: process.pid });
    expect(meta?.result).toEqual({ stdout: 'done', stderr: '', exitCode: 0 });
    expect(meta?.completedAt).toBeGreaterThan(0);
    expect(store.readOutput('job_run1')).toBe('partial ');
    expect(cleanupCliMock).toHaveBeenCalled();
  });

  it('records connection failure and returns 1', async () => {
    ensureConnectedMock.mockResolvedValue({
      success: false,
      errorInfo: { error: 'server_not_found', serverId: 'srv', reason: 'Server not found' },
    });

    const code = await runJob('job_fail1', 'srv', 'echo x', {});

    expect(code).toBe(1);
    expect(store.read('job_fail1')).toMatchObject({
      status: 'failed',
      error: 'Server not found',
    });
    expect(getOrCreateShellMock).not.toHaveBeenCalled();
  });

  it('records command failure (rejected execute) and returns 1', async () => {
    mockConnected();
    getOrCreateShellMock.mockResolvedValue({
      shell: { execute: shellExecuteMock },
      recreated: false,
    });
    shellExecuteMock.mockRejectedValue(new Error(`boom ${os.homedir()}/secret`));

    const code = await runJob('job_fail2', 'srv', 'x', {});

    expect(code).toBe(1);
    const meta = store.read('job_fail2');
    expect(meta?.status).toBe('failed');
    expect(meta?.error).toBe('boom ~/secret');
  });

  it('SIGTERM handler cancels the running command and exits', async () => {
    mockConnected();
    const cancelMock = vi.fn(() => true);
    getOrCreateShellMock.mockImplementation(
      async (_id: string, _c: unknown, reg: ShellRegistry) => {
        const shell = {
          execute: shellExecuteMock,
          isReady: true,
          hasRunningCommand: true,
          cancelCurrentCommand: cancelMock,
        };
        reg.set('srv', shell as never);
        return { shell, recreated: false };
      },
    );
    shellExecuteMock.mockReturnValue(new Promise(() => undefined)); // never settles

    const running = runJob('job_kill', 'srv', 'sleep 999', {});
    await vi.waitFor(() => expect(store.read('job_kill')?.status).toBe('running'));

    signalHandlers.get('SIGTERM')!();

    expect(cancelMock).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(store.read('job_kill')).toMatchObject({
      status: 'cancelled',
      error: 'Job cancelled by user',
    });
    expect(cleanupCliMock).toHaveBeenCalled();
    void running;
  });

  it('streams output chunks to the store while executing', async () => {
    mockConnected();
    getOrCreateShellMock.mockResolvedValue({
      shell: { execute: shellExecuteMock },
      recreated: false,
    });
    shellExecuteMock.mockImplementation(
      (_cmd: string, opts: { onOutput: (c: string) => void }) =>
        new Promise((resolve) => {
          opts.onOutput('one ');
          opts.onOutput('two ');
          setTimeout(() => resolve({ stdout: 'one two ', stderr: '', exitCode: 0 }), 10);
        }),
    );

    await runJob('job_stream', 'srv', 'x', {});

    expect(store.readOutput('job_stream')).toBe('one two ');
  });
});
