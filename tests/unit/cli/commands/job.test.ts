import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const checkJobMock = vi.hoisted(() => vi.fn());
const cancelJobMock = vi.hoisted(() => vi.fn());
const buildCliDepsMock = vi.hoisted(() => vi.fn());
const cleanupCliMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/actions/check-job.js', () => ({ checkJob: checkJobMock }));
vi.mock('../../../../src/actions/cancel-job.js', () => ({ cancelJob: cancelJobMock }));
vi.mock('../../../../src/cli/context.js', () => ({
  buildCliDeps: buildCliDepsMock,
  cleanupCli: cleanupCliMock,
}));

const { registerJobCommand } = await import('../../../../src/cli/commands/job.js');
const { captureConsole, runCapturingExit, ok, fail } =
  await import('../_fixtures/cli-command.helpers.js');
const { JobStore } = await import('../../../../src/ssh/job-store.js');

const DEPS = Symbol('deps');

describe('job command handlers', () => {
  let cap: ReturnType<typeof captureConsole>;
  let dir: string;
  let originalConfig: string | undefined;

  beforeEach(() => {
    cap = captureConsole();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-jobcmd-'));
    originalConfig = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = path.join(dir, 'config.json');
    checkJobMock.mockReset();
    cancelJobMock.mockReset();
    buildCliDepsMock.mockReset();
    buildCliDepsMock.mockReturnValue(DEPS);
    cleanupCliMock.mockReset();
  });

  afterEach(() => {
    cap.restore();
    if (originalConfig !== undefined) process.env.SSH_MCP_CONFIG = originalConfig;
    else delete process.env.SSH_MCP_CONFIG;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('job list', () => {
    it('lists persisted jobs with status and command', async () => {
      const store = new JobStore(path.join(dir, 'jobs'));
      store.save({
        id: 'job_a',
        serverId: 's1',
        command: 'echo a',
        status: 'completed',
        startedAt: Date.now() - 5000,
        completedAt: Date.now(),
      });
      store.save({
        id: 'job_b',
        serverId: 's2',
        command: 'sleep 1',
        status: 'running',
        startedAt: Date.now(),
        pid: process.pid,
      });

      await runCapturingExit(registerJobCommand, ['job', 'list']);

      const out = cap.logs.join('');
      expect(out).toContain('job_a');
      expect(out).toContain('completed');
      expect(out).toContain('echo a');
      expect(out).toContain('job_b');
      expect(out).not.toContain('runner dead');
    });

    it('flags running jobs whose runner died', async () => {
      const store = new JobStore(path.join(dir, 'jobs'));
      store.save({
        id: 'job_dead',
        serverId: 's1',
        command: 'x',
        status: 'running',
        startedAt: Date.now(),
        pid: 999999,
      });

      await runCapturingExit(registerJobCommand, ['job', 'list']);

      expect(cap.logs.join('')).toContain('runner dead');
    });

    it('filters by serverId', async () => {
      const store = new JobStore(path.join(dir, 'jobs'));
      store.save({ id: 'job_1', serverId: 'a', command: 'c1', status: 'completed', startedAt: 1 });
      store.save({ id: 'job_2', serverId: 'b', command: 'c2', status: 'completed', startedAt: 2 });

      await runCapturingExit(registerJobCommand, ['job', 'list', 'a']);

      const out = cap.logs.join('');
      expect(out).toContain('job_1');
      expect(out).not.toContain('job_2');
    });

    it('prints empty hint when no jobs', async () => {
      await runCapturingExit(registerJobCommand, ['job', 'list']);
      expect(cap.logs.join('')).toContain('No jobs found.');
    });
  });

  describe('job check', () => {
    it('prints status line to stderr and output to stdout (human mode)', async () => {
      checkJobMock.mockResolvedValue(
        ok({
          jobId: 'job_x',
          status: 'running',
          elapsedMs: 4000,
          partialOutput: 'tick 1\ntick 2\n',
        }),
      );

      const code = await runCapturingExit(registerJobCommand, ['job', 'check', 'job_x']);

      expect(checkJobMock).toHaveBeenCalledWith(
        { jobId: 'job_x', maxOutputLength: undefined },
        DEPS,
      );
      expect(cap.errors.join('')).toContain('job_x: running');
      expect(cap.stdout).toBe('tick 1\ntick 2\n');
      expect(code ?? 0).toBe(0);
    });

    it('exits 1 when the job failed', async () => {
      checkJobMock.mockResolvedValue(
        ok({ jobId: 'job_f', status: 'failed', elapsedMs: 10, error: 'boom' }),
      );

      const code = await runCapturingExit(registerJobCommand, ['job', 'check', 'job_f']);

      expect(cap.errors.join('')).toContain('error: boom');
      expect(code).toBe(1);
    });

    it('job not found exits 1 with structured error', async () => {
      checkJobMock.mockResolvedValue(
        fail('Job ghost not found', { error: 'job_not_found', message: 'Job ghost not found' }),
      );

      const code = await runCapturingExit(registerJobCommand, ['job', 'check', 'ghost']);

      expect(cap.errors.join('')).toContain('job_not_found');
      expect(code).toBe(1);
    });

    it('passes --max-output through', async () => {
      checkJobMock.mockResolvedValue(ok({ jobId: 'j', status: 'completed', elapsedMs: 1 }));

      await runCapturingExit(registerJobCommand, ['job', 'check', 'j', '--max-output', '500']);

      expect(checkJobMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxOutputLength: 500 }),
        DEPS,
      );
    });
  });

  describe('job cancel', () => {
    it('prints the cancel message', async () => {
      cancelJobMock.mockResolvedValue(
        ok({
          jobId: 'job_c',
          status: 'cancelled',
          message: 'Job cancelled and SIGTERM sent to runner process.',
        }),
      );

      const code = await runCapturingExit(registerJobCommand, ['job', 'cancel', 'job_c']);

      expect(cancelJobMock).toHaveBeenCalledWith({ jobId: 'job_c' }, DEPS);
      expect(cap.logs.join('')).toContain('SIGTERM');
      expect(code ?? 0).toBe(0);
    });

    it('exits 1 for unknown jobs', async () => {
      cancelJobMock.mockResolvedValue(
        fail('Job nope not found', { error: 'job_not_found', message: 'x' }),
      );

      const code = await runCapturingExit(registerJobCommand, ['job', 'cancel', 'nope']);

      expect(code).toBe(1);
    });
  });
});
