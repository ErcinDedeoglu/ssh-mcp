/**
 * E2E tests for SSH connection establishment and key-based authentication.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  executeCommand,
  SessionKeeper,
  type TestContext,
  type ServerConfig,
  type PasswordAuth,
  type PrivateKeyAuth,
} from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E SSH Connection Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Connection', () => {
    it('connects to test-server-1 with password auth', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);
      session.disconnect();
    });

    it('connects to test-server-2 with password auth', async () => {
      const session = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);
      session.disconnect();
    });

    it('fails to connect with wrong password', async () => {
      const badConfig: ServerConfig = {
        ...ctx.server1Config,
        id: 'bad-auth',
        auth: { password: 'wrongpassword' } as PasswordAuth,
      };
      const session = new SessionKeeper(badConfig, { maxReconnectAttempts: 0 });
      await expect(session.connect()).rejects.toThrow();
    });

    it('manages multiple connections in pool', async () => {
      const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
      await session1.connect();
      await session2.connect();
      ctx.pool.add(session1);
      ctx.pool.add(session2);
      expect(ctx.pool.size).toBe(2);
      expect(ctx.pool.has('test-server-1')).toBe(true);
      expect(ctx.pool.has('test-server-2')).toBe(true);
      ctx.pool.clear();
      expect(ctx.pool.size).toBe(0);
    });
  });

  describe('Key-Based Authentication', () => {
    it('connects with private key (no passphrase)', async () => {
      const session = new SessionKeeper(ctx.serverKeyConfig, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);

      const result = await executeCommand(session.client, 'whoami');
      expect(result.stdout.trim()).toBe('keyuser');
      expect(result.exitCode).toBe(0);

      session.disconnect();
    });

    it('connects with private key + passphrase', async () => {
      const session = new SessionKeeper(ctx.serverKeyPassphraseConfig, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);

      const result = await executeCommand(session.client, 'whoami');
      expect(result.stdout.trim()).toBe('keyuser');
      expect(result.exitCode).toBe(0);

      session.disconnect();
    });

    it('fails with wrong passphrase', async () => {
      const badConfig: ServerConfig = {
        ...ctx.serverKeyPassphraseConfig,
        id: 'bad-passphrase',
        auth: {
          privateKey: (ctx.serverKeyPassphraseConfig.auth as PrivateKeyAuth).privateKey,
          passphrase: 'wrongpassphrase',
        } as PrivateKeyAuth,
      };
      const session = new SessionKeeper(badConfig, { maxReconnectAttempts: 0 });
      await expect(session.connect()).rejects.toThrow();
    });

    it('fails with non-existent key file', async () => {
      const badConfig: ServerConfig = {
        ...ctx.serverKeyConfig,
        id: 'bad-keyfile',
        auth: {
          privateKey: '/nonexistent/key/file',
        } as PrivateKeyAuth,
      };
      const session = new SessionKeeper(badConfig, { maxReconnectAttempts: 0 });
      await expect(session.connect()).rejects.toThrow();
    });

    it('executes file transfer with key auth', async () => {
      const session = new SessionKeeper(ctx.serverKeyConfig, { maxReconnectAttempts: 0 });
      await session.connect();

      const fs = await import('node:fs');
      const path = await import('node:path');
      const os = await import('node:os');

      const localFile = path.join(os.tmpdir(), 'ssh-mcp-key-auth-test.txt');
      const remoteFile = '/tmp/ssh-mcp-key-auth-test.txt';
      const content = 'File transferred with key authentication';

      fs.writeFileSync(localFile, content);

      const { FileTransfer } = await import('./ssh.setup.js');
      const fileTransfer = new FileTransfer(session);
      await fileTransfer.upload(localFile, remoteFile);

      const result = await executeCommand(session.client, `cat ${remoteFile}`);
      expect(result.stdout).toBe(content);

      await executeCommand(session.client, `rm ${remoteFile}`);
      fs.unlinkSync(localFile);
      session.disconnect();
    });
  });
});
