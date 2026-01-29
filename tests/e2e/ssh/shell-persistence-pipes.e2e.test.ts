import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Shell Persistence - Pipes and Redirects', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Pipes', () => {
    it('handles simple pipe', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "hello world" | tr "a-z" "A-Z"');

      expect(result.stdout.trim()).toBe('HELLO WORLD');
      shell.destroy();
      session.disconnect();
    });

    it('handles multi-stage pipe', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "a b c d" | tr " " "\\n" | sort | head -2');
      const normalized = result.stdout.replace(/\r\n/g, '\n').trim();

      expect(normalized).toBe('a\nb');
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Output Redirects', () => {
    it('handles output redirect to file', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "test content" > /tmp/test_redirect.txt');
      const result = await shell.execute('cat /tmp/test_redirect.txt');
      await shell.execute('rm /tmp/test_redirect.txt');

      expect(result.stdout.trim()).toBe('test content');
      shell.destroy();
      session.disconnect();
    });

    it('handles append redirect', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "line1" > /tmp/test_append.txt');
      await shell.execute('echo "line2" >> /tmp/test_append.txt');
      const result = await shell.execute('cat /tmp/test_append.txt');
      await shell.execute('rm /tmp/test_append.txt');

      expect(result.stdout).toContain('line1');
      expect(result.stdout).toContain('line2');
      shell.destroy();
      session.disconnect();
    });

    it('handles input redirect', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "search_term" > /tmp/test_input.txt');
      const result = await shell.execute('grep "search" < /tmp/test_input.txt');
      await shell.execute('rm /tmp/test_input.txt');

      expect(result.stdout).toContain('search_term');
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Subshells and Command Substitution', () => {
    it('handles command substitution with $()', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "Today is $(date +%A)"');

      expect(result.stdout).toMatch(
        /Today is (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/,
      );
      shell.destroy();
      session.disconnect();
    });

    it('handles subshell with parentheses', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /tmp');
      const result = await shell.execute('(cd / && pwd)');
      const pwdResult = await shell.execute('pwd');

      expect(result.stdout.trim()).toBe('/');
      expect(pwdResult.stdout.trim()).toBe('/tmp');
      shell.destroy();
      session.disconnect();
    });

    it('handles nested command substitution', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "length: $(echo "hello" | wc -c | tr -d " ")"');

      expect(result.stdout).toContain('length:');
      shell.destroy();
      session.disconnect();
    });
  });
});
