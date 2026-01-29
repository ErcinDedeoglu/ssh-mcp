import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Lifecycle', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('History Cleared on Shell Destroy', () => {
    it('history is empty after shell.destroy()', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "before destroy"');
      expect(shell.getHistory()).toHaveLength(1);

      shell.destroy();
      expect(shell.getHistory()).toHaveLength(0);

      session.disconnect();
    });

    it('new shell starts with empty history', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell1.initialize(session.client);
      await shell1.execute('echo "shell1 cmd"');
      shell1.destroy();

      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell2.initialize(session.client);
      expect(shell2.getHistory()).toHaveLength(0);

      shell2.destroy();
      session.disconnect();
    });
  });

  describe('Separate Histories Per Server', () => {
    it('each server has independent history', async () => {
      const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
      await Promise.all([session1.connect(), session2.connect()]);

      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await Promise.all([shell1.initialize(session1.client), shell2.initialize(session2.client)]);

      await shell1.execute('echo "server1_a"');
      await shell1.execute('echo "server1_b"');
      await shell2.execute('echo "server2_only"');

      expect(shell1.getHistory()).toHaveLength(2);
      expect(shell2.getHistory()).toHaveLength(1);
      expect(shell1.getHistory()[0].stdout).toBe('server1_a');
      expect(shell2.getHistory()[0].stdout).toBe('server2_only');

      shell1.destroy();
      shell2.destroy();
      session1.disconnect();
      session2.disconnect();
    });

    it('destroying one shell does not affect another', async () => {
      const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
      await Promise.all([session1.connect(), session2.connect()]);

      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await Promise.all([shell1.initialize(session1.client), shell2.initialize(session2.client)]);

      await shell1.execute('echo "s1"');
      await shell2.execute('echo "s2"');
      shell1.destroy();

      expect(shell1.getHistory()).toHaveLength(0);
      expect(shell2.getHistory()).toHaveLength(1);

      shell2.destroy();
      session1.disconnect();
      session2.disconnect();
    });
  });

  describe('ShellRegistry Integration', () => {
    it('registry tracks shells with their histories', async () => {
      const registry = new ShellRegistry();
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);
      registry.set('test-server', shell);

      await shell.execute('echo "registered"');

      const retrieved = registry.get('test-server');
      expect(retrieved).toBe(shell);
      expect(retrieved?.getHistory()).toHaveLength(1);

      registry.remove('test-server');
      session.disconnect();
    });

    it('registry.remove() destroys shell and clears history', async () => {
      const registry = new ShellRegistry();
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);
      registry.set('server-x', shell);

      await shell.execute('echo "before removal"');
      expect(shell.getHistory()).toHaveLength(1);

      registry.remove('server-x');

      expect(shell.getHistory()).toHaveLength(0);
      expect(registry.get('server-x')).toBeUndefined();

      session.disconnect();
    });

    it('returns undefined for non-existent server', () => {
      const registry = new ShellRegistry();
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });
});
