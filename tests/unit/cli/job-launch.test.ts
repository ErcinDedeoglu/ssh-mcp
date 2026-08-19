import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

const { launchBackgroundJob } = await import('../../../src/cli/job-launch.js');
const { JobStore } = await import('../../../src/ssh/job-store.js');

describe('launchBackgroundJob', () => {
  let dir: string;
  let originalConfig: string | undefined;
  let unrefCalls: number;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-launch-'));
    originalConfig = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = path.join(dir, 'config.json');
    unrefCalls = 0;
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ unref: () => (unrefCalls += 1) });
  });

  afterEach(() => {
    if (originalConfig !== undefined) process.env.SSH_MCP_CONFIG = originalConfig;
    else delete process.env.SSH_MCP_CONFIG;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists a pending job and returns its id', () => {
    const { jobId } = launchBackgroundJob('srv', 'echo hi');

    expect(jobId).toMatch(/^job_/);
    const meta = new JobStore(path.join(dir, 'jobs')).read(jobId);
    expect(meta).toMatchObject({
      id: jobId,
      serverId: 'srv',
      command: 'echo hi',
      status: 'pending',
    });
  });

  it('spawns a detached runner with the expected argv', () => {
    const { jobId } = launchBackgroundJob('srv', 'sleep 5');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [execPath, args, options] = spawnMock.mock.calls[0];

    expect(execPath).toBe(process.execPath);
    expect(args[0]).toMatch(/index\.js$/);
    expect(args[1]).toBe('run-job');
    expect(args[2]).toBe(jobId);
    expect(args[3]).toBe('srv');
    const configIndex = args.indexOf('--config');
    expect(configIndex).toBeGreaterThan(-1);
    expect(args[configIndex + 1]).toBe(path.join(dir, 'config.json'));
    expect(args[args.indexOf('--') + 1]).toBe('sleep 5');

    expect(options).toMatchObject({ detached: true, stdio: 'ignore' });
    expect(unrefCalls).toBe(1);
  });

  it('forwards timeout and stallTimeout options to the runner', () => {
    launchBackgroundJob('srv', 'x', { timeout: 120, stallTimeout: 0 });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--timeout');
    expect(args[args.indexOf('--timeout') + 1]).toBe('120');
    expect(args).toContain('--stall-timeout');
    expect(args[args.indexOf('--stall-timeout') + 1]).toBe('0');
  });

  it('omits timeout flags when no options given', () => {
    launchBackgroundJob('srv', 'x');

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain('--timeout');
    expect(args).not.toContain('--stall-timeout');
  });

  it('prunes stale jobs on launch', () => {
    const store = new JobStore(path.join(dir, 'jobs'));
    store.save({
      id: 'stale',
      serverId: 'a',
      command: 'c',
      status: 'completed',
      startedAt: 1,
      completedAt: 1,
    });

    launchBackgroundJob('srv', 'x');

    expect(store.read('stale')).toBeUndefined();
  });
});
