/**
 * E2E tests for high concurrency and stress testing scenarios.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  executeCommand,
  SessionKeeper,
  ConnectionPool,
  type TestContext,
  type ExecuteResult,
} from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E SSH Concurrency and Stress Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('High Concurrency', () => {
    it('executes 10 parallel commands on same connection', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const commands = Array.from({ length: 10 }, (_, i) =>
        executeCommand(session.client, `sleep 0.1 && echo "cmd${i + 1}"`),
      );

      const results = await Promise.all(commands);

      results.forEach((result, i) => {
        expect(result.stdout.trim()).toBe(`cmd${i + 1}`);
        expect(result.exitCode).toBe(0);
      });

      session.disconnect();
    }, 15000);

    it('executes batched parallel commands on same connection', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const batch1 = Array.from({ length: 5 }, (_, i) =>
        executeCommand(session.client, `echo "batch1-${i + 1}"`),
      );
      const results1 = await Promise.all(batch1);
      results1.forEach((result, i) => {
        expect(result.stdout.trim()).toBe(`batch1-${i + 1}`);
        expect(result.exitCode).toBe(0);
      });

      const batch2 = Array.from({ length: 5 }, (_, i) =>
        executeCommand(session.client, `echo "batch2-${i + 1}"`),
      );
      const results2 = await Promise.all(batch2);
      results2.forEach((result, i) => {
        expect(result.stdout.trim()).toBe(`batch2-${i + 1}`);
        expect(result.exitCode).toBe(0);
      });

      session.disconnect();
    }, 15000);

    it('handles rapid sequential commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      for (let i = 0; i < 50; i++) {
        const result = await executeCommand(session.client, `echo ${i}`);
        expect(result.stdout.trim()).toBe(String(i));
      }

      session.disconnect();
    }, 30000);

    it('multiple connections to same server', async () => {
      const sessions = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
          await session.connect();
          return session;
        }),
      );

      const results = await Promise.all(
        sessions.map((session, i) => executeCommand(session.client, `echo "session${i + 1}"`)),
      );

      results.forEach((result, i) => {
        expect(result.stdout.trim()).toBe(`session${i + 1}`);
      });

      sessions.forEach((session) => session.disconnect());
    }, 15000);
  });

  describe('Stress Tests', () => {
    it('handles rapid connect/disconnect cycles', async () => {
      for (let i = 0; i < 10; i++) {
        const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
        await session.connect();
        expect(session.isConnected).toBe(true);
        session.disconnect();
      }
    }, 30000);

    it('handles 10 parallel connections to same server', async () => {
      const sessions = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
          await session.connect();
          return session;
        }),
      );

      expect(sessions.every((s) => s.isConnected)).toBe(true);

      const results = await Promise.all(
        sessions.map((session, i) => executeCommand(session.client, `echo "conn${i}"`)),
      );

      results.forEach((result, i) => {
        expect(result.stdout.trim()).toBe(`conn${i}`);
      });

      sessions.forEach((session) => session.disconnect());
    }, 30000);

    it('handles interleaved operations across multiple servers', async () => {
      const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });

      await Promise.all([session1.connect(), session2.connect()]);

      const operations: Promise<ExecuteResult>[] = [];
      for (let i = 0; i < 10; i++) {
        operations.push(executeCommand(session1.client, `echo "s1-${i}"`));
        operations.push(executeCommand(session2.client, `echo "s2-${i}"`));
      }

      const results = await Promise.all(operations);

      for (let i = 0; i < 10; i++) {
        expect(results[i * 2].stdout.trim()).toBe(`s1-${i}`);
        expect(results[i * 2 + 1].stdout.trim()).toBe(`s2-${i}`);
      }

      session1.disconnect();
      session2.disconnect();
    }, 15000);

    it('connection pool handles rapid add/remove cycles', async () => {
      const testPool = new ConnectionPool();

      for (let cycle = 0; cycle < 5; cycle++) {
        const sessions = await Promise.all(
          Array.from({ length: 3 }, async (_, i) => {
            const config = { ...ctx.server1Config, id: `stress-${cycle}-${i}` };
            const session = new SessionKeeper(config, { maxReconnectAttempts: 0 });
            await session.connect();
            return session;
          }),
        );

        sessions.forEach((session) => testPool.add(session));
        expect(testPool.size).toBe(3);

        sessions.forEach((session) => testPool.remove(session.id));
        expect(testPool.size).toBe(0);
      }
    }, 60000);
  });
});
