import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  executeCommand,
  SessionKeeper,
  type TestContext,
  type ServerConfig,
} from './ssh.setup.js';
import { createJumpStream } from '../../../src/ssh/jump-stream.js';

describe.skipIf(!isDockerRunning())('E2E Jump Host Connection Tests', () => {
  let ctx: TestContext;

  const jumpTargetConfig: ServerConfig = {
    id: 'jump-target',
    host: 'ssh-mcp-test-2',
    port: 2222,
    username: 'admin',
    auth: { password: 'admin456' },
    description: 'Server 2 via Docker internal network',
  };

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Jump Connection via API', () => {
    it('creates jump stream through connected session', async () => {
      const jumpSession = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await jumpSession.connect();
      expect(jumpSession.isConnected).toBe(true);

      const stream = await createJumpStream(jumpSession, 'ssh-mcp-test-2', 2222);
      expect(stream).toBeDefined();

      stream.end();
      jumpSession.disconnect();
    });

    it('connects to target through jump host', async () => {
      const jumpSession = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await jumpSession.connect();

      const jumpStream = await createJumpStream(
        jumpSession,
        jumpTargetConfig.host,
        jumpTargetConfig.port,
      );

      const targetSession = new SessionKeeper(jumpTargetConfig, {
        maxReconnectAttempts: 0,
        jumpStream,
      });
      await targetSession.connect();

      expect(targetSession.isConnected).toBe(true);
      expect(targetSession.isJumpConnection).toBe(true);

      const result = await executeCommand(targetSession.client, 'whoami');
      expect(result.stdout.trim()).toBe('admin');
      expect(result.exitCode).toBe(0);

      targetSession.disconnect();
      jumpSession.disconnect();
    });

    it('executes commands on target through jump host', async () => {
      const jumpSession = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await jumpSession.connect();

      const jumpStream = await createJumpStream(
        jumpSession,
        jumpTargetConfig.host,
        jumpTargetConfig.port,
      );

      const targetSession = new SessionKeeper(jumpTargetConfig, {
        maxReconnectAttempts: 0,
        jumpStream,
      });
      await targetSession.connect();

      const hostnameResult = await executeCommand(targetSession.client, 'hostname');
      expect(hostnameResult.stdout.trim()).toBe('test-server-2');

      const echoResult = await executeCommand(targetSession.client, 'echo "Hello through jump"');
      expect(echoResult.stdout.trim()).toBe('Hello through jump');

      targetSession.disconnect();
      jumpSession.disconnect();
    });

    it('fails when jump host disconnects during target session', async () => {
      const jumpSession = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await jumpSession.connect();

      const jumpStream = await createJumpStream(
        jumpSession,
        jumpTargetConfig.host,
        jumpTargetConfig.port,
      );

      const targetSession = new SessionKeeper(jumpTargetConfig, {
        maxReconnectAttempts: 0,
        jumpStream,
      });
      await targetSession.connect();

      let disconnectEmitted = false;
      targetSession.on('disconnected', () => {
        disconnectEmitted = true;
      });

      jumpSession.disconnect();

      await new Promise((r) => setTimeout(r, 500));
      expect(disconnectEmitted).toBe(true);
      expect(targetSession.isConnected).toBe(false);
    });
  });
});
