import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Edge Cases', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Failed Commands (Non-Zero Exit Codes)', () => {
    it('records exit code 1 for failing command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('false');
      const entry = shell.getHistory()[0];

      expect(entry.exitCode).toBe(1);
      expect(entry.command).toBe('false');

      shell.destroy();
      session.disconnect();
    });

    it('records custom exit code', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('bash -c "exit 42"');
      const entry = shell.getHistory()[0];

      expect(entry.exitCode).toBe(42);

      shell.destroy();
      session.disconnect();
    });

    it('mixes successful and failed commands in history', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "ok"');
      await shell.execute('false');
      await shell.execute('echo "also ok"');

      const history = shell.getHistory();
      expect(history[0].exitCode).toBe(0);
      expect(history[1].exitCode).toBe(1);
      expect(history[2].exitCode).toBe(0);

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Empty Output', () => {
    it('records empty stdout for no-output commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('true');
      const entry = shell.getHistory()[0];

      expect(entry.stdout).toBe('');
      expect(entry.exitCode).toBe(0);

      shell.destroy();
      session.disconnect();
    });

    it('records empty stdout for cd command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /tmp');
      const entry = shell.getHistory()[0];

      expect(entry.stdout).toBe('');
      expect(entry.exitCode).toBe(0);

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Special Characters in Commands', () => {
    it('handles quotes in command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "hello \'world\'"');
      const entry = shell.getHistory()[0];

      expect(entry.command).toBe('echo "hello \'world\'"');
      expect(entry.stdout).toBe("hello 'world'");

      shell.destroy();
      session.disconnect();
    });

    it('handles special shell characters', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "$HOME"');
      const entry = shell.getHistory()[0];

      expect(entry.command).toBe('echo "$HOME"');
      expect(entry.stdout.length).toBeGreaterThan(0);

      shell.destroy();
      session.disconnect();
    });

    it('handles newlines in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo -e "line1\\nline2\\nline3"');
      const entry = shell.getHistory()[0];

      expect(entry.stdout).toContain('line1');
      expect(entry.stdout).toContain('line2');
      expect(entry.stdout).toContain('line3');

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Concurrent Commands', () => {
    it('records all concurrent commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await Promise.all([
        shell.execute('echo "concurrent1"'),
        shell.execute('echo "concurrent2"'),
        shell.execute('echo "concurrent3"'),
      ]);

      const history = shell.getHistory();
      expect(history).toHaveLength(3);

      const outputs = history.map((h) => h.stdout);
      expect(outputs).toContain('concurrent1');
      expect(outputs).toContain('concurrent2');
      expect(outputs).toContain('concurrent3');

      shell.destroy();
      session.disconnect();
    });
  });
});
