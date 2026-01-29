import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Shell Persistence - Control Flow', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Compound Commands', () => {
    it('handles && operator', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('true && echo "success"');

      expect(result.stdout.trim()).toBe('success');
      expect(result.exitCode).toBe(0);
      shell.destroy();
      session.disconnect();
    });

    it('handles && short-circuit', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('false && echo "should not appear"');

      expect(result.stdout.trim()).not.toContain('should not appear');
      expect(result.exitCode).not.toBe(0);
      shell.destroy();
      session.disconnect();
    });

    it('handles || operator', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('false || echo "fallback"');

      expect(result.stdout.trim()).toBe('fallback');
      expect(result.exitCode).toBe(0);
      shell.destroy();
      session.disconnect();
    });

    it('handles semicolon command separator', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('echo "first"; echo "second"; echo "third"');

      expect(result.stdout).toContain('first');
      expect(result.stdout).toContain('second');
      expect(result.stdout).toContain('third');
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Loops and Conditionals', () => {
    it('handles for loop', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('for i in 1 2 3; do echo "num:$i"; done');

      expect(result.stdout).toContain('num:1');
      expect(result.stdout).toContain('num:2');
      expect(result.stdout).toContain('num:3');
      shell.destroy();
      session.disconnect();
    });

    it('handles if statement', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute(
        'if [ -d /tmp ]; then echo "exists"; else echo "missing"; fi',
      );

      expect(result.stdout.trim()).toBe('exists');
      shell.destroy();
      session.disconnect();
    });

    it('handles while loop', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const result = await shell.execute('i=0; while [ $i -lt 3 ]; do echo $i; i=$((i+1)); done');

      expect(result.stdout).toContain('0');
      expect(result.stdout).toContain('1');
      expect(result.stdout).toContain('2');
      shell.destroy();
      session.disconnect();
    });
  });

  describe('Functions and Aliases', () => {
    it('defines and calls shell function', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('greet() { echo "Hello, $1!"; }');
      const result = await shell.execute('greet World');

      expect(result.stdout.trim()).toBe('Hello, World!');
      shell.destroy();
      session.disconnect();
    });

    it('function persists across commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('add() { echo $(($1 + $2)); }');
      await shell.execute('true');
      const result = await shell.execute('add 5 3');

      expect(result.stdout.trim()).toBe('8');
      shell.destroy();
      session.disconnect();
    });

    it('defines and uses alias', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('alias ll="ls -la"');
      await shell.execute('shopt -s expand_aliases');
      const result = await shell.execute('type ll');

      expect(result.stdout).toContain('alias');
      shell.destroy();
      session.disconnect();
    });
  });
});
