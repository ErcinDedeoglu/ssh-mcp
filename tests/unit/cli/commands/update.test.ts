import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Command } from 'commander';
import { Command as CommandCtor } from 'commander';

const selfUpdateMock = vi.hoisted(() => vi.fn());
const checkForUpdateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/cli/updater.js', () => ({
  selfUpdate: selfUpdateMock,
  checkForUpdate: checkForUpdateMock,
}));

const { registerUpdateCommand, notifyUpdate } =
  await import('../../../../src/cli/commands/update.js');
const { captureConsole, runCapturingExit } = await import('../_fixtures/cli-command.helpers.js');

describe('update command handler', () => {
  let cap: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    cap = captureConsole();
    selfUpdateMock.mockReset();
  });

  afterEach(() => cap.restore());

  it('prints upgrade summary in human mode', async () => {
    selfUpdateMock.mockResolvedValue({
      fromVersion: '1.2.0',
      toVersion: '1.3.0',
      packageManager: 'npm',
      reinstalled: false,
    });

    const code = await runCapturingExit(registerUpdateCommand, ['update']);

    expect(cap.logs.join('')).toContain('Updated ssh-mcp-cli 1.2.0 -> 1.3.0 via npm');
    expect(code ?? 0).toBe(0);
  });

  it('prints reinstall summary when already current', async () => {
    selfUpdateMock.mockResolvedValue({
      fromVersion: '1.3.0',
      toVersion: '1.3.0',
      packageManager: 'bun',
      reinstalled: true,
    });

    await runCapturingExit(registerUpdateCommand, ['update']);

    expect(cap.logs.join('')).toContain('Reinstalled ssh-mcp-cli 1.3.0 -> 1.3.0 via bun');
  });

  it('prints JSON payload with --json', async () => {
    selfUpdateMock.mockResolvedValue({
      fromVersion: '1.2.0',
      toVersion: '1.3.0',
      packageManager: 'npm',
      reinstalled: false,
    });

    await runCapturingExit(registerUpdateCommand, ['update', '--json']);

    expect(JSON.parse(cap.logs.join(''))).toMatchObject({
      fromVersion: '1.2.0',
      toVersion: '1.3.0',
    });
  });

  it('exits 1 with error message on failure', async () => {
    selfUpdateMock.mockRejectedValue(new Error('EACCES: permission denied'));

    const code = await runCapturingExit(registerUpdateCommand, ['update']);

    expect(cap.errors.join('')).toContain('Update failed: EACCES');
    expect(code).toBe(1);
  });

  it('exits 1 with JSON error payload on failure (--json)', async () => {
    selfUpdateMock.mockRejectedValue(new Error('network down'));

    const code = await runCapturingExit(registerUpdateCommand, ['update', '--json']);

    expect(JSON.parse(cap.logs.join(''))).toMatchObject({ error: 'network down' });
    expect(code).toBe(1);
  });
});

describe('notifyUpdate (nudge)', () => {
  let cap: ReturnType<typeof captureConsole>;

  function makeProgram(json: boolean): Command {
    const program = new CommandCtor();
    program.option('--json', 'machine-readable JSON output');
    if (json) program.setOptionValue('json', true);
    return program;
  }

  beforeEach(() => {
    cap = captureConsole();
    checkForUpdateMock.mockReset();
  });

  afterEach(() => cap.restore());

  it('nudges on stderr when an update is available', async () => {
    checkForUpdateMock.mockResolvedValue({
      currentVersion: '1.2.0',
      latestVersion: '1.3.0',
      updateAvailable: true,
    });

    await notifyUpdate(makeProgram(false));

    const err = cap.errors.join('');
    expect(err).toContain('1.3.0 is available');
    expect(err).toContain("Run 'ssh-mcp update'");
  });

  it('stays silent when current', async () => {
    checkForUpdateMock.mockResolvedValue({
      currentVersion: '1.3.0',
      latestVersion: '1.3.0',
      updateAvailable: false,
    });

    await notifyUpdate(makeProgram(false));

    expect(cap.errors.join('')).toBe('');
  });

  it('stays silent in --json mode even when an update exists', async () => {
    checkForUpdateMock.mockResolvedValue({
      currentVersion: '1.2.0',
      latestVersion: '1.3.0',
      updateAvailable: true,
    });

    await notifyUpdate(makeProgram(true));

    expect(cap.errors.join('')).toBe('');
  });

  it('never throws when the registry is unreachable', async () => {
    checkForUpdateMock.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(notifyUpdate(makeProgram(false))).resolves.toBeUndefined();
    expect(cap.errors.join('')).toBe('');
  });
});
