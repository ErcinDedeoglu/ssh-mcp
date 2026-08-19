import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const executeCommandMock = vi.hoisted(() => vi.fn());
const launchBackgroundJobMock = vi.hoisted(() => vi.fn());
const buildCliDepsMock = vi.hoisted(() => vi.fn());
const cleanupCliMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/actions/execute.js', () => ({
  executeCommand: executeCommandMock,
}));
vi.mock('../../../../src/cli/job-launch.js', () => ({
  launchBackgroundJob: launchBackgroundJobMock,
}));
vi.mock('../../../../src/cli/context.js', () => ({
  buildCliDeps: buildCliDepsMock,
  cleanupCli: cleanupCliMock,
}));

const { registerExecCommand } = await import('../../../../src/cli/commands/exec.js');
const { captureConsole, runCapturingExit, ok, fail } =
  await import('../_fixtures/cli-command.helpers.js');

const DEPS = Symbol('deps');

describe('exec command handler', () => {
  let cap: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    cap = captureConsole();
    executeCommandMock.mockReset();
    launchBackgroundJobMock.mockReset();
    buildCliDepsMock.mockReset();
    buildCliDepsMock.mockReturnValue(DEPS);
    cleanupCliMock.mockReset();
  });

  afterEach(() => cap.restore());

  it('prints stdout and propagates the remote exit code (human mode)', async () => {
    executeCommandMock.mockResolvedValue(
      ok({
        serverId: 's',
        command: 'c',
        stdout: 'hello\n',
        stderr: '',
        exitCode: 7,
        truncated: false,
      }),
    );

    const code = await runCapturingExit(registerExecCommand, ['exec', 's', 'echo', 'hello']);

    expect(cap.stdout).toBe('hello\n');
    expect(code).toBe(7);
    expect(executeCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 's', command: 'echo hello' }),
      DEPS,
    );
  });

  it('prints JSON payload in --json mode', async () => {
    executeCommandMock.mockResolvedValue(
      ok({ serverId: 's', command: 'c', stdout: 'out', stderr: '', exitCode: 0, truncated: false }),
    );

    const code = await runCapturingExit(registerExecCommand, ['exec', 's', 'true', '--json']);

    expect(JSON.parse(cap.logs.join(''))).toMatchObject({ stdout: 'out', exitCode: 0 });
    expect(code ?? 0).toBe(0);
  });

  it('writes stderr to stderr and appends missing newline', async () => {
    executeCommandMock.mockResolvedValue(
      ok({
        serverId: 's',
        command: 'c',
        stdout: 'out',
        stderr: 'warn',
        exitCode: 0,
        truncated: false,
      }),
    );

    await runCapturingExit(registerExecCommand, ['exec', 's', 'x']);

    expect(cap.stderr).toBe('warn');
    expect(cap.stdout).toBe('out\n');
  });

  it('reports action failure on stderr with exit 1', async () => {
    executeCommandMock.mockResolvedValue(
      fail('Connection refused', { error: 'connection_failed' }),
    );

    const code = await runCapturingExit(registerExecCommand, ['exec', 's', 'x']);

    expect(cap.errors.join('')).toContain('connection_failed');
    expect(code).toBe(1);
  });

  it('passes parsed options to the action', async () => {
    executeCommandMock.mockResolvedValue(
      ok({ serverId: 's', command: 'c', stdout: '', stderr: '', exitCode: 0, truncated: false }),
    );

    await runCapturingExit(registerExecCommand, [
      'exec',
      's',
      'sleep',
      '10',
      '--timeout',
      '30',
      '--stall-timeout',
      '0',
      '--agent-forward',
    ]);

    expect(executeCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 30,
        stallTimeout: 0,
        agentForward: true,
      }),
      DEPS,
    );
  });

  it('--bg launches a background job without running the action', async () => {
    launchBackgroundJobMock.mockReturnValue({ jobId: 'job_x1' });

    const code = await runCapturingExit(registerExecCommand, ['exec', 's', 'sleep', '99', '--bg']);

    expect(launchBackgroundJobMock).toHaveBeenCalledWith('s', 'sleep 99', {
      timeout: undefined,
      stallTimeout: undefined,
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(cap.logs.join('')).toContain('job_x1');
    expect(code).toBeUndefined();
  });

  it('--bg --json prints the job envelope', async () => {
    launchBackgroundJobMock.mockReturnValue({ jobId: 'job_x2' });

    await runCapturingExit(registerExecCommand, ['exec', 's', 'x', '--bg', '--json']);

    expect(JSON.parse(cap.logs.join(''))).toMatchObject({
      jobId: 'job_x2',
      status: 'running',
    });
  });

  it('always cleans up deps', async () => {
    executeCommandMock.mockResolvedValue(
      ok({ serverId: 's', command: 'c', stdout: '', stderr: '', exitCode: 0, truncated: false }),
    );

    await runCapturingExit(registerExecCommand, ['exec', 's', 'x']);

    expect(cleanupCliMock).toHaveBeenCalledWith(DEPS);
  });
});
