import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Shell Persistence - Large and Unicode Output', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Large Output', () => {
    it('handles output with many lines', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('seq 1 100');

      const normalized = result.stdout.replace(/\r\n/g, '\n').trim();
      const lines = normalized.split('\n');
      expect(lines.length).toBe(100);
      expect(lines[0]).toBe('1');
      expect(lines[99]).toBe('100');
      shell.destroy();
      session.disconnect();
    });

    it('handles output near buffer boundaries', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('dd if=/dev/zero bs=1024 count=100 2>/dev/null | base64');

      expect(result.stdout.length).toBeGreaterThan(100 * 1024);
      expect(result.exitCode).toBe(0);
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Unicode Output', () => {
    it('handles unicode characters', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "Hello 世界 🌍"');

      expect(result.stdout).toContain('Hello');
      expect(result.stdout).toContain('世界');
      shell.destroy();
      session.disconnect();
    });

    it('handles emoji in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "Status: ✅ Done"');

      expect(result.stdout).toContain('✅');
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Empty and Whitespace Output', () => {
    it('handles empty output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('true');

      expect(result.stdout.trim()).toBe('');
      expect(result.exitCode).toBe(0);
      shell.destroy();
      session.disconnect();
    });

    it('handles whitespace-only output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "   "');

      expect(result.stdout.trim()).toBe('');
      shell.destroy();
      session.disconnect();
    });
  });
});
