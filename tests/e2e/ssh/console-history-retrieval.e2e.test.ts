import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Retrieval', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Limit Parameter', () => {
    it('returns all entries when no limit specified', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      for (let i = 0; i < 5; i++) {
        await shell.execute(`echo "${i}"`);
      }

      const history = shell.getHistory();
      expect(history).toHaveLength(5);

      shell.destroy();
      session.disconnect();
    });

    it('returns last N entries with limit', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      for (let i = 0; i < 10; i++) {
        await shell.execute(`echo "cmd${i}"`);
      }

      const history = shell.getHistory(3);
      expect(history).toHaveLength(3);
      expect(history[0].stdout).toBe('cmd7');
      expect(history[1].stdout).toBe('cmd8');
      expect(history[2].stdout).toBe('cmd9');

      shell.destroy();
      session.disconnect();
    });

    it('returns all if limit exceeds history size', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "only"');

      const history = shell.getHistory(100);
      expect(history).toHaveLength(1);

      shell.destroy();
      session.disconnect();
    });

    it('limit=1 returns only the last command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "old"');
      await shell.execute('echo "newest"');

      const history = shell.getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].stdout).toBe('newest');

      shell.destroy();
      session.disconnect();
    });

    it('limit=0 returns empty array', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "something"');

      const history = shell.getHistory(0);
      expect(history).toHaveLength(0);

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Empty History', () => {
    it('returns empty array for new shell', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const history = shell.getHistory();
      expect(history).toHaveLength(0);
      expect(history).toEqual([]);

      shell.destroy();
      session.disconnect();
    });

    it('returns empty array with limit on empty history', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const history = shell.getHistory(10);
      expect(history).toHaveLength(0);

      shell.destroy();
      session.disconnect();
    });
  });
});
