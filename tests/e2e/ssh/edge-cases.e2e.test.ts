/**
 * E2E tests for edge cases and permission denied scenarios.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  isDockerRunning,
  createTestContext,
  executeCommand,
  SessionKeeper,
  FileTransfer,
  ConnectionPool,
  type TestContext,
} from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E SSH Edge Cases Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Permission Denied Scenarios', () => {
    it('command returns error for non-existent command', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const result = await executeCommand(session.client, 'nonexistentcommand12345');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);

      session.disconnect();
    });

    it('command execution continues after error', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const failResult = await executeCommand(session.client, 'exit 127');
      expect(failResult.exitCode).toBe(127);

      const successResult = await executeCommand(session.client, 'echo "recovered"');
      expect(successResult.stdout.trim()).toBe('recovered');
      expect(successResult.exitCode).toBe(0);

      session.disconnect();
    });

    it('rejects SFTP upload to read-only filesystem location', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const localFile = path.join(os.tmpdir(), 'ssh-mcp-permission-test.txt');
      fs.writeFileSync(localFile, 'test content');

      const fileTransfer = new FileTransfer(session);

      await expect(fileTransfer.upload(localFile, '/proc/test-file.txt')).rejects.toThrow();

      fs.unlinkSync(localFile);
      session.disconnect();
    });

    it('rejects SFTP download of non-existent file', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const fileTransfer = new FileTransfer(session);
      const localPath = path.join(os.tmpdir(), 'ssh-mcp-nonexistent-download-perm.txt');

      await expect(
        fileTransfer.download('/nonexistent/path/to/file.txt', localPath),
      ).rejects.toThrow(/not found/i);

      session.disconnect();
    });
  });

  describe('Edge Cases', () => {
    it('handles very long command strings', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const longArg = 'x'.repeat(10000);
      const result = await executeCommand(session.client, `echo "${longArg}" | wc -c`);

      expect(parseInt(result.stdout.trim())).toBe(10001);

      session.disconnect();
    });

    it('handles command with many environment variables', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const envVars = Array.from({ length: 50 }, (_, i) => `VAR${i}=value${i}`).join(' ');
      const result = await executeCommand(session.client, `${envVars} env | grep ^VAR | wc -l`);

      expect(parseInt(result.stdout.trim())).toBe(50);

      session.disconnect();
    });

    it('handles connection to different servers in pool simultaneously', async () => {
      const testPool = new ConnectionPool();

      const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
      const sessionKey = new SessionKeeper(ctx.serverKeyConfig, { maxReconnectAttempts: 0 });

      await Promise.all([session1.connect(), session2.connect(), sessionKey.connect()]);

      testPool.add(session1);
      testPool.add(session2);
      testPool.add(sessionKey);

      expect(testPool.size).toBe(3);
      expect(testPool.has('test-server-1')).toBe(true);
      expect(testPool.has('test-server-2')).toBe(true);
      expect(testPool.has('test-server-key')).toBe(true);

      const [r1, r2, rKey] = await Promise.all([
        executeCommand(session1.client, 'whoami'),
        executeCommand(session2.client, 'whoami'),
        executeCommand(sessionKey.client, 'whoami'),
      ]);

      expect(r1.stdout.trim()).toBe('testuser');
      expect(r2.stdout.trim()).toBe('admin');
      expect(rKey.stdout.trim()).toBe('keyuser');

      testPool.clear();
      expect(testPool.size).toBe(0);
    });

    it('session touch() updates activity timestamp', async () => {
      const session = new SessionKeeper(ctx.server1Config, {
        maxReconnectAttempts: 0,
        idleTimeoutMs: 100,
      });
      await session.connect();

      const initialActivity = session.lastActivity;

      await new Promise((resolve) => setTimeout(resolve, 50));
      session.touch();

      expect(session.lastActivity).toBeGreaterThan(initialActivity);
      expect(session.isIdle).toBe(false);

      session.disconnect();
    });

    it('file transfer works with absolute home path', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const localFile = path.join(os.tmpdir(), 'ssh-mcp-home-test.txt');
      fs.writeFileSync(localFile, 'home path test');

      const homeDir = (await executeCommand(session.client, 'echo $HOME')).stdout.trim();
      const remotePath = `${homeDir}/home-test-file.txt`;

      const fileTransfer = new FileTransfer(session);
      await fileTransfer.upload(localFile, remotePath);

      const result = await executeCommand(session.client, `cat ${remotePath}`);
      expect(result.stdout).toBe('home path test');

      await executeCommand(session.client, `rm ${remotePath}`);
      fs.unlinkSync(localFile);
      session.disconnect();
    });
  });
});
