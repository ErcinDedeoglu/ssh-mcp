import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Shell Persistence - Cleanup and Isolation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Shell Cleanup', () => {
    it('shell is not usable after destroy()', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "before destroy"');
      shell.destroy();

      await expect(shell.execute('echo "after destroy"')).rejects.toThrow();
      session.disconnect();
    });

    it('can create new shell after destroying previous', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell1.initialize(session.client);
      await shell1.execute('export SHELL1_VAR=value1');
      shell1.destroy();

      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell2.initialize(session.client);
      const result = await shell2.execute('echo "var: $SHELL1_VAR"');

      expect(result.stdout.trim()).toBe('var:');
      shell2.destroy();
      session.disconnect();
    });

    it('pending commands rejected on destroy', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const pendingPromise = shell.execute('sleep 5');
      shell.destroy();

      await expect(pendingPromise).rejects.toThrow(/destroyed|closed/i);
      session.disconnect();
    });
  });

  describe('State Isolation', () => {
    it('different shells have independent state', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell1.initialize(session.client);
      await shell2.initialize(session.client);

      await shell1.execute('cd /tmp');
      await shell1.execute('export ISO_VAR=shell1');
      await shell2.execute('cd /');
      await shell2.execute('export ISO_VAR=shell2');

      const pwd1 = await shell1.execute('pwd');
      const pwd2 = await shell2.execute('pwd');
      const var1 = await shell1.execute('echo $ISO_VAR');
      const var2 = await shell2.execute('echo $ISO_VAR');

      expect(pwd1.stdout.trim()).toBe('/tmp');
      expect(pwd2.stdout.trim()).toBe('/');
      expect(var1.stdout.trim()).toBe('shell1');
      expect(var2.stdout.trim()).toBe('shell2');

      shell1.destroy();
      shell2.destroy();
      session.disconnect();
    });

    it('different servers have independent shells', async () => {
      const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
      await session1.connect();
      await session2.connect();

      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell1.initialize(session1.client);
      await shell2.initialize(session2.client);

      await shell1.execute('export SERVER_ID=server1');
      await shell2.execute('export SERVER_ID=server2');

      const id1 = await shell1.execute('echo $SERVER_ID');
      const id2 = await shell2.execute('echo $SERVER_ID');

      expect(id1.stdout.trim()).toBe('server1');
      expect(id2.stdout.trim()).toBe('server2');

      shell1.destroy();
      shell2.destroy();
      session1.disconnect();
      session2.disconnect();
    });
  });
});
