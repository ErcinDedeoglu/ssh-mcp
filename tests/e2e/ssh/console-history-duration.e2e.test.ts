import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Duration and Pipes', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Duration Tracking', () => {
    it('fast command has small duration', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "fast"');
      const entry = shell.getHistory()[0];

      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(entry.durationMs).toBeLessThan(1000);

      shell.destroy();
      session.disconnect();
    });

    it('slow command has larger duration', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('sleep 0.5');
      const entry = shell.getHistory()[0];

      expect(entry.durationMs).toBeGreaterThanOrEqual(400);
      expect(entry.durationMs).toBeLessThan(2000);

      shell.destroy();
      session.disconnect();
    });

    it('duration increases for sequential commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "instant"');
      await shell.execute('sleep 0.2');

      const history = shell.getHistory();
      expect(history[1].durationMs).toBeGreaterThan(history[0].durationMs);

      shell.destroy();
      session.disconnect();
    });

    it('each command has independent duration', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('sleep 0.3');
      await shell.execute('echo "fast"');
      await shell.execute('sleep 0.2');

      const history = shell.getHistory();
      expect(history[0].durationMs).toBeGreaterThan(200);
      expect(history[1].durationMs).toBeLessThan(200);
      expect(history[2].durationMs).toBeGreaterThan(100);

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Pipe and Redirection', () => {
    it('records piped command output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "hello world" | tr "a-z" "A-Z"');
      const entry = shell.getHistory()[0];

      expect(entry.stdout).toBe('HELLO WORLD');
      expect(entry.exitCode).toBe(0);

      shell.destroy();
      session.disconnect();
    });

    it('records command with input redirection', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cat < /etc/hostname');
      const entry = shell.getHistory()[0];

      expect(entry.exitCode).toBe(0);
      expect(entry.stdout.length).toBeGreaterThan(0);

      shell.destroy();
      session.disconnect();
    });

    it('records multi-pipe command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "abc123def" | tr -d "0-9" | tr "a-z" "A-Z"');
      const entry = shell.getHistory()[0];

      expect(entry.stdout).toBe('ABCDEF');
      expect(entry.exitCode).toBe(0);

      shell.destroy();
      session.disconnect();
    });

    it('records grep pipe results', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo -e "apple\\nbanana\\napricot" | grep "^a"');
      const entry = shell.getHistory()[0];

      expect(entry.stdout).toContain('apple');
      expect(entry.stdout).toContain('apricot');
      expect(entry.stdout).not.toContain('banana');

      shell.destroy();
      session.disconnect();
    });
  });
});
