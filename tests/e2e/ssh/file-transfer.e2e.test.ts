/**
 * E2E tests for SFTP file upload/download and file size limits.
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
  MAX_FILE_SIZE,
  type TestContext,
} from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E SSH File Transfer Tests', () => {
  let ctx: TestContext;
  const localTestFile = path.join(os.tmpdir(), 'ssh-mcp-test-upload.txt');
  const localDownloadFile = path.join(os.tmpdir(), 'ssh-mcp-test-download.txt');
  const remoteTestFile = '/tmp/ssh-mcp-test-file.txt';
  const testContent = 'Hello from SSH MCP test!\nLine 2\nLine 3';

  beforeAll(() => {
    ctx = createTestContext();
    fs.writeFileSync(localTestFile, testContent);
  });

  afterAll(() => {
    ctx.pool.clear();
    try {
      fs.unlinkSync(localTestFile);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(localDownloadFile);
    } catch {
      /* ignore */
    }
  });

  describe('File Transfer (SFTP)', () => {
    it('uploads file to remote server', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);
      await fileTransfer.upload(localTestFile, remoteTestFile);
      const result = await executeCommand(session.client, `cat ${remoteTestFile}`);
      expect(result.stdout).toBe(testContent);
      session.disconnect();
    });

    it('downloads file from remote server', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      await executeCommand(session.client, `echo -n "${testContent}" > ${remoteTestFile}`);
      const fileTransfer = new FileTransfer(session);
      await fileTransfer.download(remoteTestFile, localDownloadFile);
      const downloadedContent = fs.readFileSync(localDownloadFile, 'utf-8');
      expect(downloadedContent).toBe(testContent);
      session.disconnect();
    });

    it('creates remote directory if needed', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const remotePath = '/tmp/ssh-mcp-test-dir/subdir/file.txt';
      await executeCommand(session.client, 'rm -rf /tmp/ssh-mcp-test-dir');
      const fileTransfer = new FileTransfer(session);
      await fileTransfer.upload(localTestFile, remotePath);
      const result = await executeCommand(session.client, `cat ${remotePath}`);
      expect(result.stdout).toBe(testContent);
      await executeCommand(session.client, 'rm -rf /tmp/ssh-mcp-test-dir');
      session.disconnect();
    });

    it('expands ~ in remote paths', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);
      const homeDir = (await executeCommand(session.client, 'echo $HOME')).stdout.trim();
      await fileTransfer.upload(localTestFile, '~/test-file.txt');
      const result = await executeCommand(session.client, `cat ${homeDir}/test-file.txt`);
      expect(result.stdout).toBe(testContent);
      await executeCommand(session.client, `rm ${homeDir}/test-file.txt`);
      session.disconnect();
    });
  });

  describe('File Size Limits', () => {
    it('allows upload and download of small files', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const localFile = path.join(os.tmpdir(), 'ssh-mcp-small-file.txt');
      const remoteFile = '/tmp/ssh-mcp-small-file.txt';
      const localDownload = path.join(os.tmpdir(), 'ssh-mcp-small-download.txt');

      fs.writeFileSync(localFile, 'Small file content for testing');

      const fileTransfer = new FileTransfer(session);

      await fileTransfer.upload(localFile, remoteFile);
      const uploadResult = await executeCommand(session.client, `cat ${remoteFile}`);
      expect(uploadResult.stdout).toBe('Small file content for testing');

      await fileTransfer.download(remoteFile, localDownload);
      expect(fs.existsSync(localDownload)).toBe(true);
      expect(fs.readFileSync(localDownload, 'utf-8')).toBe('Small file content for testing');

      fs.unlinkSync(localFile);
      fs.unlinkSync(localDownload);
      await executeCommand(session.client, `rm ${remoteFile}`);
      session.disconnect();
    });

    it('MAX_FILE_SIZE constant is 100MB', () => {
      expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
    });

    it('rejects upload of non-existent file', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);

      await expect(
        fileTransfer.upload('/nonexistent/file/path.txt', '/tmp/test.txt'),
      ).rejects.toThrow(/Local file not found/);

      session.disconnect();
    });

    it('rejects download of non-existent remote file', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);
      const localPath = path.join(os.tmpdir(), 'ssh-mcp-nonexistent-download.txt');

      await expect(
        fileTransfer.download('/nonexistent/remote/file.txt', localPath),
      ).rejects.toThrow(/Remote file not found/);

      session.disconnect();
    });
  });
});
