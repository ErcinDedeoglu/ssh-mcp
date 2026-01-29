import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Shell State Persistence Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Working Directory Persistence', () => {
    it('maintains cwd across commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /tmp');
      const result = await shell.execute('pwd');

      expect(result.stdout.trim()).toBe('/tmp');
      expect(result.exitCode).toBe(0);

      shell.destroy();
      session.disconnect();
    });

    it('navigates multiple directories', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /');
      const root = await shell.execute('pwd');
      expect(root.stdout.trim()).toBe('/');

      await shell.execute('cd /tmp');
      const tmp = await shell.execute('pwd');
      expect(tmp.stdout.trim()).toBe('/tmp');

      await shell.execute('cd ..');
      const parent = await shell.execute('pwd');
      expect(parent.stdout.trim()).toBe('/');

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Environment Variable Persistence', () => {
    it('maintains env vars across commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('export MY_VAR="test_value_123"');
      const result = await shell.execute('echo $MY_VAR');

      expect(result.stdout.trim()).toBe('test_value_123');
      expect(result.exitCode).toBe(0);

      shell.destroy();
      session.disconnect();
    });

    it('supports multiple env vars', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('export VAR1="first"');
      await shell.execute('export VAR2="second"');
      const result = await shell.execute('echo "$VAR1 and $VAR2"');

      expect(result.stdout.trim()).toBe('first and second');

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Combined State Persistence', () => {
    it('maintains both cwd and env vars', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /tmp');
      await shell.execute('export PROJECT="my_project"');
      const result = await shell.execute('echo "In $(pwd) for $PROJECT"');

      expect(result.stdout.trim()).toBe('In /tmp for my_project');

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Command Queuing', () => {
    it('queues concurrent commands in order', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      const results = await Promise.all([
        shell.execute('echo 1'),
        shell.execute('echo 2'),
        shell.execute('echo 3'),
      ]);

      expect(results[0].stdout.trim()).toBe('1');
      expect(results[1].stdout.trim()).toBe('2');
      expect(results[2].stdout.trim()).toBe('3');

      shell.destroy();
      session.disconnect();
    });
  });
});
