import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Shell Persistence - Special Characters', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Quotes and Escapes', () => {
    it('handles double quotes in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "hello \\"world\\""');

      expect(result.stdout.trim()).toBe('hello "world"');
      shell.destroy();
      session.disconnect();
    });

    it('handles single quotes in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "it\'s working"');

      expect(result.stdout.trim()).toBe("it's working");
      shell.destroy();
      session.disconnect();
    });

    it('handles backslashes in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "path\\\\to\\\\file"');

      expect(result.stdout.trim()).toBe('path\\to\\file');
      shell.destroy();
      session.disconnect();
    });

    it('handles dollar signs in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute("echo 'price: $100'");

      expect(result.stdout.trim()).toBe('price: $100');
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Whitespace Characters', () => {
    it('handles newlines in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('printf "line1\\nline2\\nline3"');

      expect(result.stdout).toContain('line1');
      expect(result.stdout).toContain('line2');
      expect(result.stdout).toContain('line3');
      shell.destroy();
      session.disconnect();
    });

    it('handles tabs in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('printf "col1\\tcol2\\tcol3"');

      expect(result.stdout).toContain('col1\tcol2\tcol3');
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Marker-like Strings', () => {
    it('handles output containing __MCP_ prefix', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "__MCP_FAKE_MARKER__"');

      expect(result.stdout.trim()).toBe('__MCP_FAKE_MARKER__');
      expect(result.exitCode).toBe(0);
      shell.destroy();
      session.disconnect();
    });

    it('handles output containing __MCP_END_', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "text __MCP_END_xyz__ more text"');

      expect(result.stdout.trim()).toBe('text __MCP_END_xyz__ more text');
      shell.destroy();
      session.disconnect();
    });

    it('filters lines containing __MCP_EXIT (echoed command pattern)', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "__MCP_EXIT=42"');

      expect(result.stdout.trim()).toBe('');
      expect(result.exitCode).toBe(0);
      shell.destroy();
      session.disconnect();
    });
  });
});
