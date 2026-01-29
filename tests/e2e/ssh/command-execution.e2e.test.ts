/**
 * E2E tests for SSH command execution, concurrent commands, and timeouts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  executeCommand,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E SSH Command Execution Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Command Execution', () => {
    it('executes simple command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo "Hello World"');
      expect(result.stdout.trim()).toBe('Hello World');
      expect(result.exitCode).toBe(0);
      session.disconnect();
    });

    it('executes command with arguments', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'expr 2 + 2');
      expect(result.stdout.trim()).toBe('4');
      expect(result.exitCode).toBe(0);
      session.disconnect();
    });

    it('captures stderr', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo "error" >&2');
      expect(result.stderr.trim()).toBe('error');
      expect(result.exitCode).toBe(0);
      session.disconnect();
    });

    it('returns non-zero exit code on failure', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'exit 42');
      expect(result.exitCode).toBe(42);
      session.disconnect();
    });

    it('handles command with pipe', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(
        session.client,
        'echo -e "line1\\nline2\\nline3" | wc -l',
      );
      expect(result.stdout.trim()).toBe('3');
      session.disconnect();
    });
  });

  describe('Concurrent Commands', () => {
    it('executes multiple commands simultaneously on same connection', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const commands = [
        executeCommand(session.client, 'sleep 0.1 && echo "cmd1"'),
        executeCommand(session.client, 'sleep 0.1 && echo "cmd2"'),
        executeCommand(session.client, 'sleep 0.1 && echo "cmd3"'),
      ];

      const results = await Promise.all(commands);
      expect(results[0].stdout.trim()).toBe('cmd1');
      expect(results[1].stdout.trim()).toBe('cmd2');
      expect(results[2].stdout.trim()).toBe('cmd3');
      expect(results.every((r) => r.exitCode === 0)).toBe(true);
      session.disconnect();
    });

    it('handles mixed success and failure in concurrent commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const commands = [
        executeCommand(session.client, 'echo "success"'),
        executeCommand(session.client, 'exit 1'),
        executeCommand(session.client, 'echo "also success"'),
      ];

      const results = await Promise.all(commands);
      expect(results[0].exitCode).toBe(0);
      expect(results[1].exitCode).toBe(1);
      expect(results[2].exitCode).toBe(0);
      session.disconnect();
    });

    it('connection remains usable after failed command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const failResult = await executeCommand(session.client, 'exit 42');
      expect(failResult.exitCode).toBe(42);

      expect(session.isConnected).toBe(true);
      const successResult = await executeCommand(session.client, 'echo "recovered"');
      expect(successResult.stdout.trim()).toBe('recovered');
      expect(successResult.exitCode).toBe(0);

      session.disconnect();
    });
  });

  describe('Command Timeout', () => {
    it('command completes before timeout', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const result = await executeCommand(session.client, 'sleep 0.5 && echo "completed"');
      expect(result.stdout.trim()).toBe('completed');
      expect(result.exitCode).toBe(0);

      session.disconnect();
    });

    it('long-running command continues until completion', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const startTime = Date.now();
      const result = await executeCommand(session.client, 'sleep 2 && echo "done after 2 seconds"');
      const elapsed = Date.now() - startTime;

      expect(result.stdout.trim()).toBe('done after 2 seconds');
      expect(elapsed).toBeGreaterThanOrEqual(1900);

      session.disconnect();
    }, 10000);
  });
});
