/**
 * E2E tests for session keep-alive, idle timeout, and auto-reconnection.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  executeCommand,
  SessionKeeper,
  type TestContext,
  type ServerConfig,
} from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E SSH Session Lifecycle Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Keep-Alive', () => {
    it('maintains connection with keep-alive', async () => {
      const session = new SessionKeeper(ctx.server1Config, {
        keepaliveIntervalMs: 1000,
        maxReconnectAttempts: 0,
      });
      await session.connect();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      expect(session.isConnected).toBe(true);
      const result = await executeCommand(session.client, 'echo "still connected"');
      expect(result.stdout.trim()).toBe('still connected');
      session.disconnect();
    }, 10000);
  });

  describe('Idle Timeout', () => {
    it('marks session as idle after configured timeout', async () => {
      const idleTimeoutMs = 100;
      const session = new SessionKeeper(ctx.server1Config, {
        maxReconnectAttempts: 0,
        idleTimeoutMs,
      });
      await session.connect();

      expect(session.isIdle).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, idleTimeoutMs + 50));

      expect(session.isIdle).toBe(true);

      session.touch();
      expect(session.isIdle).toBe(false);

      session.disconnect();
    });

    it('health check reflects idle status', async () => {
      const idleTimeoutMs = 100;
      const session = new SessionKeeper(ctx.server1Config, {
        maxReconnectAttempts: 0,
        idleTimeoutMs,
      });
      await session.connect();

      let health = session.healthCheck();
      expect(health.connected).toBe(true);
      expect(health.idle).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, idleTimeoutMs + 50));

      health = session.healthCheck();
      expect(health.connected).toBe(true);
      expect(health.idle).toBe(true);

      session.disconnect();
    });
  });

  describe('Auto-Reconnection', () => {
    it('emits reconnecting event on unexpected disconnect', async () => {
      const session = new SessionKeeper(ctx.server1Config, {
        maxReconnectAttempts: 3,
        baseReconnectDelayMs: 100,
      });
      const reconnectingEvents: Array<{ attempt: number; delay: number }> = [];

      session.on('reconnecting', (attempt, delay) => {
        reconnectingEvents.push({ attempt, delay });
      });

      await session.connect();
      expect(session.isConnected).toBe(true);

      session.client.destroy();

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(reconnectingEvents.length).toBeGreaterThan(0);
      expect(reconnectingEvents[0].attempt).toBe(1);

      session.disconnect();
    }, 10000);

    it('successfully reconnects after connection drop', async () => {
      const session = new SessionKeeper(ctx.server1Config, {
        maxReconnectAttempts: 5,
        baseReconnectDelayMs: 100,
        maxReconnectDelayMs: 500,
      });
      let reconnected = false;

      session.on('reconnected', () => {
        reconnected = true;
      });

      await session.connect();

      session.client.destroy();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(reconnected).toBe(true);
      expect(session.isConnected).toBe(true);

      const result = await executeCommand(session.client, 'echo "reconnected successfully"');
      expect(result.stdout.trim()).toBe('reconnected successfully');

      session.disconnect();
    }, 15000);

    it('fails to connect to unreachable host', async () => {
      const badConfig: ServerConfig = {
        ...ctx.server1Config,
        id: 'unreachable-server',
        host: '192.0.2.1',
        timeouts: { connection: 1 },
      };

      const session = new SessionKeeper(badConfig, {
        maxReconnectAttempts: 0,
      });

      await expect(session.connect()).rejects.toThrow();
    }, 10000);

    it('does not reconnect after intentional disconnect', async () => {
      const session = new SessionKeeper(ctx.server1Config, {
        maxReconnectAttempts: 3,
        baseReconnectDelayMs: 50,
      });
      const reconnectingEvents: number[] = [];

      session.on('reconnecting', (attempt) => {
        reconnectingEvents.push(attempt);
      });

      await session.connect();
      session.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(reconnectingEvents.length).toBe(0);
    });

    it('health check shows reconnecting status during reconnection', async () => {
      const session = new SessionKeeper(ctx.server1Config, {
        maxReconnectAttempts: 5,
        baseReconnectDelayMs: 500,
      });

      await session.connect();

      let healthDuringReconnect: ReturnType<typeof session.healthCheck> | null = null;

      session.on('reconnecting', () => {
        healthDuringReconnect = session.healthCheck();
      });

      session.client.destroy();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(healthDuringReconnect).not.toBeNull();
      expect(healthDuringReconnect!.reconnecting).toBe(true);
      expect(healthDuringReconnect!.reconnectAttempt).toBe(1);

      session.disconnect();
    }, 10000);
  });
});
