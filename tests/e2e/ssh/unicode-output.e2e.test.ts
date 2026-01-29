/**
 * E2E tests for unicode in command output and large output handling.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  executeCommand,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E SSH Unicode and Large Output Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Unicode and Special Characters', () => {
    it('handles unicode in command output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo "Hello 世界 🚀 émojis"');
      expect(result.stdout.trim()).toBe('Hello 世界 🚀 émojis');
      session.disconnect();
    });

    it('handles special shell characters', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo "quotes: \\"test\\" and $HOME"');
      expect(result.stdout).toContain('quotes:');
      expect(result.exitCode).toBe(0);
      session.disconnect();
    });

    it('handles newlines and tabs in output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'printf "line1\\nline2\\ttabbed"');
      expect(result.stdout).toBe('line1\nline2\ttabbed');
      session.disconnect();
    });
  });

  describe('Large Output Handling', () => {
    it('handles large stdout output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const result = await executeCommand(
        session.client,
        'dd if=/dev/zero bs=1024 count=1024 2>/dev/null | base64',
      );

      expect(result.stdout.length).toBeGreaterThan(1024 * 1024);
      expect(result.exitCode).toBe(0);

      session.disconnect();
    }, 30000);

    it('handles large stderr output', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const result = await executeCommand(
        session.client,
        'dd if=/dev/zero bs=1024 count=100 2>/dev/null | base64 >&2',
      );

      expect(result.stderr.length).toBeGreaterThan(100 * 1024);
      expect(result.exitCode).toBe(0);

      session.disconnect();
    }, 30000);

    it('handles mixed stdout and stderr', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const result = await executeCommand(
        session.client,
        'for i in $(seq 1 100); do echo "stdout line $i"; echo "stderr line $i" >&2; done',
      );

      expect(result.stdout).toContain('stdout line 1');
      expect(result.stdout).toContain('stdout line 100');
      expect(result.stderr).toContain('stderr line 1');
      expect(result.stderr).toContain('stderr line 100');
      expect(result.exitCode).toBe(0);

      session.disconnect();
    });
  });
});
