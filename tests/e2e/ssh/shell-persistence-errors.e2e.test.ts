import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Shell Persistence - Error Handling', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Failed Commands', () => {
    it('captures non-zero exit code from subshell', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('(exit 42)');

      expect(result.exitCode).toBe(42);
      shell.destroy();
      session.disconnect();
    });

    it('preserves cwd after failed command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /tmp');
      await shell.execute('false');
      const result = await shell.execute('pwd');

      expect(result.stdout.trim()).toBe('/tmp');
      shell.destroy();
      session.disconnect();
    });

    it('preserves env vars after failed command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('export MYVAR=preserved');
      await shell.execute('false');
      const result = await shell.execute('echo $MYVAR');

      expect(result.stdout.trim()).toBe('preserved');
      shell.destroy();
      session.disconnect();
    });

    it('handles command not found', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('nonexistent_command_xyz');

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain('not found');
      shell.destroy();
      session.disconnect();
    });

    it('handles file not found', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('cat /nonexistent_file_xyz');

      expect(result.exitCode).not.toBe(0);
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Stderr Handling', () => {
    it('captures stderr in stdout (shell merges streams)', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "error message" >&2');

      expect(result.stdout).toContain('error message');
      expect(result.exitCode).toBe(0);
      shell.destroy();
      session.disconnect();
    });

    it('captures mixed stdout and stderr', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "out"; echo "err" >&2; echo "out2"');

      expect(result.stdout).toContain('out');
      expect(result.stdout).toContain('err');
      expect(result.stdout).toContain('out2');
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Timeout Handling', () => {
    it('times out on long-running command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 1000, stallTimeoutMs: 500 });
      await shell.initialize(session.client);

      await expect(shell.execute('sleep 10')).rejects.toThrow(/timed out|stalled/i);

      shell.destroy();
      session.disconnect();
    });

    it('shell remains usable after timeout on different session', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell1 = new ShellSession({ timeoutMs: 500, stallTimeoutMs: 300 });
      await shell1.initialize(session.client);
      await expect(shell1.execute('sleep 10')).rejects.toThrow();
      shell1.destroy();

      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell2.initialize(session.client);
      const result = await shell2.execute('echo "recovered"');

      expect(result.stdout.trim()).toBe('recovered');
      shell2.destroy();
      session.disconnect();
    });
  });

  describe('Edge Cases', () => {
    it('handles cd to nonexistent directory', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /tmp');
      const failedCd = await shell.execute('cd /nonexistent_dir_xyz');
      const pwd = await shell.execute('pwd');

      expect(failedCd.exitCode).not.toBe(0);
      expect(pwd.stdout.trim()).toBe('/tmp');
      shell.destroy();
      session.disconnect();
    });

    it('handles test command failure', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('[ -f /nonexistent_file ]');

      expect(result.exitCode).toBe(1);
      shell.destroy();
      session.disconnect();
    });
  });
});
