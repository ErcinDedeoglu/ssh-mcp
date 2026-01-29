import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';

describe.skipIf(!isDockerRunning())('E2E Shell Persistence - Registry and Connection', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('ShellRegistry', () => {
    it('registry tracks shells by server id', () => {
      const registry = new ShellRegistry();
      const shell1 = new ShellSession();
      const shell2 = new ShellSession();

      registry.set('server-1', shell1);
      registry.set('server-2', shell2);

      expect(registry.get('server-1')).toBe(shell1);
      expect(registry.get('server-2')).toBe(shell2);
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('registry remove destroys and removes shell', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const registry = new ShellRegistry();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);
      registry.set('test-server', shell);

      expect(shell.isReady).toBe(true);
      registry.remove('test-server');
      expect(shell.isReady).toBe(false);
      expect(registry.get('test-server')).toBeUndefined();

      session.disconnect();
    });

    it('registry clear destroys all shells', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const registry = new ShellRegistry();
      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell1.initialize(session.client);
      await shell2.initialize(session.client);
      registry.set('server-1', shell1);
      registry.set('server-2', shell2);

      registry.clear();

      expect(shell1.isReady).toBe(false);
      expect(shell2.isReady).toBe(false);
      expect(registry.get('server-1')).toBeUndefined();
      expect(registry.get('server-2')).toBeUndefined();

      session.disconnect();
    });
  });

  describe('SSH Connection Lifecycle', () => {
    it('shell becomes unusable when SSH disconnects', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result1 = await shell.execute('echo "before"');
      expect(result1.stdout.trim()).toBe('before');

      session.disconnect();

      await expect(shell.execute('echo "after"')).rejects.toThrow();
    });

    it('new shell can be created after reconnect', async () => {
      const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session1.connect();

      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell1.initialize(session1.client);
      await shell1.execute('export RECONNECT_VAR=original');
      shell1.destroy();
      session1.disconnect();

      // ssh2 Client is not reusable after disconnect - must create new SessionKeeper
      const session2 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session2.connect();
      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell2.initialize(session2.client);
      const result = await shell2.execute('echo "var: $RECONNECT_VAR"');

      expect(result.stdout.trim()).toBe('var:');
      shell2.destroy();
      session2.disconnect();
    });
  });

  describe('Rapid Operations', () => {
    it('handles rapid sequential commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const results: string[] = [];
      for (let i = 0; i < 20; i++) {
        const result = await shell.execute(`echo ${i}`);
        results.push(result.stdout.trim());
      }

      expect(results).toEqual(Array.from({ length: 20 }, (_, i) => String(i)));
      shell.destroy();
      session.disconnect();
    });

    it('handles rapid create/destroy cycles', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      for (let i = 0; i < 5; i++) {
        const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
        await shell.initialize(session.client);
        const result = await shell.execute(`echo "cycle ${i}"`);
        expect(result.stdout).toContain(`cycle ${i}`);
        shell.destroy();
      }

      session.disconnect();
    });
  });
});
