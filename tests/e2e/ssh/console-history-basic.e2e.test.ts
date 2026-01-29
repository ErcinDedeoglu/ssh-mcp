import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Basic Recording', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('History Entry Fields', () => {
    it('records command with all required fields', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "hello world"');
      const history = shell.getHistory();

      expect(history).toHaveLength(1);
      const entry = history[0];
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('command');
      expect(entry).toHaveProperty('stdout');
      expect(entry).toHaveProperty('exitCode');
      expect(entry).toHaveProperty('durationMs');

      shell.destroy();
      session.disconnect();
    });

    it('records correct command string', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "test123"');
      const entry = shell.getHistory()[0];

      expect(entry.command).toBe('echo "test123"');

      shell.destroy();
      session.disconnect();
    });

    it('records correct stdout', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "output_value"');
      const entry = shell.getHistory()[0];

      expect(entry.stdout).toBe('output_value');

      shell.destroy();
      session.disconnect();
    });

    it('records correct exit code for successful command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('true');
      const entry = shell.getHistory()[0];

      expect(entry.exitCode).toBe(0);

      shell.destroy();
      session.disconnect();
    });

    it('records valid ISO timestamp', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const before = new Date();
      await shell.execute('echo "time test"');
      const after = new Date();

      const entry = shell.getHistory()[0];
      const timestamp = new Date(entry.timestamp);

      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());

      shell.destroy();
      session.disconnect();
    });

    it('records positive duration in milliseconds', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('sleep 0.1');
      const entry = shell.getHistory()[0];

      expect(entry.durationMs).toBeGreaterThan(50);
      expect(entry.durationMs).toBeLessThan(2000);

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Multiple Commands', () => {
    it('records all executed commands in order', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "first"');
      await shell.execute('echo "second"');
      await shell.execute('echo "third"');

      const history = shell.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].stdout).toBe('first');
      expect(history[1].stdout).toBe('second');
      expect(history[2].stdout).toBe('third');

      shell.destroy();
      session.disconnect();
    });

    it('maintains chronological order of timestamps', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "a"');
      await shell.execute('echo "b"');
      await shell.execute('echo "c"');

      const history = shell.getHistory();
      const t1 = new Date(history[0].timestamp).getTime();
      const t2 = new Date(history[1].timestamp).getTime();
      const t3 = new Date(history[2].timestamp).getTime();

      expect(t1).toBeLessThanOrEqual(t2);
      expect(t2).toBeLessThanOrEqual(t3);

      shell.destroy();
      session.disconnect();
    });
  });
});
