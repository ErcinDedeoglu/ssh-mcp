/**
 * E2E tests for inline private key authentication.
 * Verifies that private keys can be passed directly in config instead of file paths.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  executeCommand,
  SessionKeeper,
  type TestContext,
  type ServerConfig,
  type PrivateKeyAuth,
} from './ssh.setup.js';

const KEYS_DIR = path.join(import.meta.dirname, '..', 'keys');

function readKeyFile(filename: string): string {
  return fs.readFileSync(path.join(KEYS_DIR, filename), 'utf-8');
}

describe.skipIf(!isDockerRunning())('E2E Inline Key Authentication', () => {
  let ctx: TestContext;
  let inlineKey: string;
  let inlineKeyPassphrase: string;

  beforeAll(() => {
    ctx = createTestContext();
    inlineKey = readKeyFile('test_key');
    inlineKeyPassphrase = readKeyFile('test_key_passphrase');
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('inline key without passphrase', () => {
    it('connects with inline private key content', async () => {
      const inlineConfig: ServerConfig = {
        id: 'inline-key-test',
        host: ctx.serverKeyConfig.host,
        port: ctx.serverKeyConfig.port,
        username: ctx.serverKeyConfig.username,
        auth: { privateKey: inlineKey },
      };

      const session = new SessionKeeper(inlineConfig, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);

      const result = await executeCommand(session.client, 'whoami');
      expect(result.stdout.trim()).toBe('keyuser');
      expect(result.exitCode).toBe(0);

      session.disconnect();
    });

    it('executes multiple commands with inline key', async () => {
      const inlineConfig: ServerConfig = {
        id: 'inline-key-multi',
        host: ctx.serverKeyConfig.host,
        port: ctx.serverKeyConfig.port,
        username: ctx.serverKeyConfig.username,
        auth: { privateKey: inlineKey },
      };

      const session = new SessionKeeper(inlineConfig, { maxReconnectAttempts: 0 });
      await session.connect();

      const r1 = await executeCommand(session.client, 'echo hello');
      expect(r1.stdout.trim()).toBe('hello');

      const r2 = await executeCommand(session.client, 'pwd');
      expect(r2.exitCode).toBe(0);

      const r3 = await executeCommand(session.client, 'uname -s');
      expect(r3.stdout.trim()).toBe('Linux');

      session.disconnect();
    });
  });

  describe('inline key with passphrase', () => {
    it('connects with inline encrypted key + passphrase', async () => {
      const originalAuth = ctx.serverKeyPassphraseConfig.auth as PrivateKeyAuth;

      const inlineConfig: ServerConfig = {
        id: 'inline-key-passphrase',
        host: ctx.serverKeyPassphraseConfig.host,
        port: ctx.serverKeyPassphraseConfig.port,
        username: ctx.serverKeyPassphraseConfig.username,
        auth: {
          privateKey: inlineKeyPassphrase,
          passphrase: originalAuth.passphrase,
        },
      };

      const session = new SessionKeeper(inlineConfig, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);

      const result = await executeCommand(session.client, 'whoami');
      expect(result.stdout.trim()).toBe('keyuser');

      session.disconnect();
    });

    it('fails with inline encrypted key + wrong passphrase', async () => {
      const inlineConfig: ServerConfig = {
        id: 'inline-key-wrong-pass',
        host: ctx.serverKeyPassphraseConfig.host,
        port: ctx.serverKeyPassphraseConfig.port,
        username: ctx.serverKeyPassphraseConfig.username,
        auth: {
          privateKey: inlineKeyPassphrase,
          passphrase: 'wrongpassphrase',
        },
      };

      const session = new SessionKeeper(inlineConfig, { maxReconnectAttempts: 0 });
      await expect(session.connect()).rejects.toThrow();
    });
  });

  describe('mixed configurations', () => {
    it('file path and inline key work in same pool', async () => {
      const filePathConfig = ctx.serverKeyConfig;

      const inlineConfig: ServerConfig = {
        id: 'inline-in-pool',
        host: ctx.serverKeyConfig.host,
        port: ctx.serverKeyConfig.port,
        username: ctx.serverKeyConfig.username,
        auth: { privateKey: inlineKey },
      };

      const session1 = new SessionKeeper(filePathConfig, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(inlineConfig, { maxReconnectAttempts: 0 });

      await session1.connect();
      await session2.connect();

      ctx.pool.add(session1);
      ctx.pool.add(session2);

      expect(ctx.pool.size).toBe(2);

      const r1 = await executeCommand(session1.client, 'echo file-path');
      const r2 = await executeCommand(session2.client, 'echo inline-key');

      expect(r1.stdout.trim()).toBe('file-path');
      expect(r2.stdout.trim()).toBe('inline-key');

      ctx.pool.clear();
    });
  });

  describe('edge cases', () => {
    it('handles key with Windows line endings (CRLF)', async () => {
      const crlfKey = inlineKey.replace(/\n/g, '\r\n');

      const config: ServerConfig = {
        id: 'crlf-key',
        host: ctx.serverKeyConfig.host,
        port: ctx.serverKeyConfig.port,
        username: ctx.serverKeyConfig.username,
        auth: { privateKey: crlfKey },
      };

      const session = new SessionKeeper(config, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);

      session.disconnect();
    });

    it('handles key with extra trailing newlines', async () => {
      const paddedKey = inlineKey + '\n\n\n';

      const config: ServerConfig = {
        id: 'padded-key',
        host: ctx.serverKeyConfig.host,
        port: ctx.serverKeyConfig.port,
        username: ctx.serverKeyConfig.username,
        auth: { privateKey: paddedKey },
      };

      const session = new SessionKeeper(config, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);

      session.disconnect();
    });
  });
});
