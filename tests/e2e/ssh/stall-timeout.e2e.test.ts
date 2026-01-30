import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Stall Timeout Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Configurable stall timeout', () => {
    it('uses default stall timeout when not specified', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo fast');
      expect(result.stdout.trim()).toBe('fast');

      shell.destroy();
      session.disconnect();
    });

    it('uses per-command stall timeout when specified', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 1000 });
      await shell.initialize(session.client);

      const startTime = Date.now();
      const result = await shell.execute('echo -n a && sleep 0.5 && echo b', {
        stallTimeoutMs: 2000,
      });
      const elapsed = Date.now() - startTime;

      expect(result.stdout).toContain('a');
      expect(result.stdout).toContain('b');
      expect(elapsed).toBeGreaterThan(400);

      shell.destroy();
      session.disconnect();
    });

    it('stall timeout triggers when no output for specified time', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 30000, stallTimeoutMs: 10000 });
      await shell.initialize(session.client);

      await expect(shell.execute('sleep 5', { stallTimeoutMs: 500 })).rejects.toThrow(/stalled/i);

      shell.destroy();
      session.disconnect();
    }, 10000);
  });

  describe('Disable stall timeout', () => {
    it('allows long silent periods when stallTimeout is 0', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 30000, stallTimeoutMs: 500 });
      await shell.initialize(session.client);

      const result = await shell.execute('sleep 2 && echo done', { stallTimeoutMs: 0 });
      expect(result.stdout.trim()).toBe('done');

      shell.destroy();
      session.disconnect();
    }, 10000);

    it('allows long silent periods when stallTimeout is null', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 30000, stallTimeoutMs: 500 });
      await shell.initialize(session.client);

      const result = await shell.execute('sleep 2 && echo done', { stallTimeoutMs: null });
      expect(result.stdout.trim()).toBe('done');

      shell.destroy();
      session.disconnect();
    }, 10000);

    it('still respects overall command timeout when stall disabled', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 1000, stallTimeoutMs: 500 });
      await shell.initialize(session.client);

      await expect(shell.execute('sleep 10', { stallTimeoutMs: 0 })).rejects.toThrow(/timed out/i);

      shell.destroy();
      session.disconnect();
    }, 5000);
  });

  describe('Command cancellation sends SIGINT', () => {
    it('sends interrupt on stall timeout', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 30000, stallTimeoutMs: 500 });
      await shell.initialize(session.client);

      await shell.execute('sleep 30', { stallTimeoutMs: 500 }).catch(() => {});

      const result = await shell.execute('echo still alive');
      expect(result.stdout.trim()).toBe('still alive');

      shell.destroy();
      session.disconnect();
    }, 10000);

    it('cancelCurrentCommand sends interrupt and allows new commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 30000, stallTimeoutMs: null });
      await shell.initialize(session.client);

      const longRunningPromise = shell.execute('sleep 30');

      await new Promise((r) => setTimeout(r, 100));
      expect(shell.hasRunningCommand).toBe(true);
      shell.cancelCurrentCommand();

      await expect(longRunningPromise).rejects.toThrow(/cancelled/i);

      await new Promise((r) => setTimeout(r, 200));
      const result = await shell.execute('echo recovered');
      expect(result.stdout.trim()).toBe('recovered');

      shell.destroy();
      session.disconnect();
    }, 10000);
  });
});
