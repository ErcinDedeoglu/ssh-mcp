/**
 * E2E tests for binary file transfer, unicode filenames, and special content.
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
  type TestContext,
} from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E SSH Binary File Transfer Tests', () => {
  let ctx: TestContext;
  const localBinaryFile = path.join(os.tmpdir(), 'ssh-mcp-test-binary.bin');
  const localDownloadBinary = path.join(os.tmpdir(), 'ssh-mcp-test-binary-dl.bin');
  const remoteBinaryFile = '/tmp/ssh-mcp-test-binary.bin';

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
    try {
      fs.unlinkSync(localBinaryFile);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(localDownloadBinary);
    } catch {
      /* ignore */
    }
  });

  describe('Binary File Transfer', () => {
    it('uploads and downloads binary file correctly', async () => {
      const binaryData = Buffer.alloc(1024);
      for (let i = 0; i < binaryData.length; i++) {
        binaryData[i] = i % 256;
      }
      fs.writeFileSync(localBinaryFile, binaryData);

      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);

      await fileTransfer.upload(localBinaryFile, remoteBinaryFile);
      await fileTransfer.download(remoteBinaryFile, localDownloadBinary);

      const downloadedData = fs.readFileSync(localDownloadBinary);
      expect(downloadedData.equals(binaryData)).toBe(true);

      await executeCommand(session.client, `rm ${remoteBinaryFile}`);
      session.disconnect();
    });

    it('handles empty file transfer', async () => {
      const emptyFile = path.join(os.tmpdir(), 'ssh-mcp-empty.txt');
      const emptyDownload = path.join(os.tmpdir(), 'ssh-mcp-empty-dl.txt');
      const remoteEmpty = '/tmp/ssh-mcp-empty.txt';
      fs.writeFileSync(emptyFile, '');

      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);

      await fileTransfer.upload(emptyFile, remoteEmpty);
      await fileTransfer.download(remoteEmpty, emptyDownload);

      const downloaded = fs.readFileSync(emptyDownload, 'utf-8');
      expect(downloaded).toBe('');

      await executeCommand(session.client, `rm ${remoteEmpty}`);
      fs.unlinkSync(emptyFile);
      fs.unlinkSync(emptyDownload);
      session.disconnect();
    });
  });

  describe('Unicode Filename Transfer', () => {
    it('transfers file with unicode filename', async () => {
      const unicodeFile = path.join(os.tmpdir(), 'ssh-mcp-日本語.txt');
      const remoteUnicode = '/tmp/ssh-mcp-日本語.txt';
      const content = 'Unicode content: 日本語テスト';
      fs.writeFileSync(unicodeFile, content);

      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);

      await fileTransfer.upload(unicodeFile, remoteUnicode);
      const result = await executeCommand(session.client, `cat "${remoteUnicode}"`);
      expect(result.stdout).toBe(content);

      await executeCommand(session.client, `rm "${remoteUnicode}"`);
      fs.unlinkSync(unicodeFile);
      session.disconnect();
    });
  });

  describe('Special Content Transfer', () => {
    it('handles file transfer with special characters in content', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const localFile = path.join(os.tmpdir(), 'ssh-mcp-special-content.txt');
      const remoteFile = '/tmp/ssh-mcp-special-content.txt';
      const localDownload = path.join(os.tmpdir(), 'ssh-mcp-special-content-dl.txt');

      const specialContent = 'Line1\x00NullByte\x01\x02Control\nLine2\t\tTabs\n日本語\n🚀🎉';
      fs.writeFileSync(localFile, specialContent);

      const fileTransfer = new FileTransfer(session);
      await fileTransfer.upload(localFile, remoteFile);
      await fileTransfer.download(remoteFile, localDownload);

      const downloaded = fs.readFileSync(localDownload);
      const original = fs.readFileSync(localFile);
      expect(downloaded.equals(original)).toBe(true);

      fs.unlinkSync(localFile);
      fs.unlinkSync(localDownload);
      await executeCommand(session.client, `rm ${remoteFile}`);
      session.disconnect();
    });

    it('handles multiple file transfers on same connection', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const fileTransfer = new FileTransfer(session);

      for (let i = 0; i < 3; i++) {
        const localFile = path.join(os.tmpdir(), `ssh-mcp-multi-${i}.txt`);
        const remoteFile = `/tmp/ssh-mcp-multi-${i}.txt`;
        fs.writeFileSync(localFile, `Content ${i}`);
        await fileTransfer.upload(localFile, remoteFile);
        fs.unlinkSync(localFile);
      }

      const result = await executeCommand(session.client, 'ls /tmp/ssh-mcp-multi-* | wc -l');
      expect(parseInt(result.stdout.trim())).toBe(3);

      await executeCommand(session.client, 'rm /tmp/ssh-mcp-multi-*');
      session.disconnect();
    }, 30000);
  });
});
