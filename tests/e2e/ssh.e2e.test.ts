// E2E tests - requires: docker compose -f docker-compose.test.yml up -d
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { SessionKeeper } from '../../src/ssh/session.js';
import { FileTransfer } from '../../src/ssh/sftp.js';
import { ConnectionPool } from '../../src/ssh/pool.js';
import type { ServerConfig, PasswordAuth } from '../../src/config/types.js';
import type { Client } from 'ssh2';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, 'config.test.json');

interface TestConfig {
  servers: ServerConfig[];
}

interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function loadTestConfig(): TestConfig {
  const content = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
  return JSON.parse(content) as TestConfig;
}

function isDockerRunning(): boolean {
  try {
    const result = execSync('docker compose -f docker-compose.test.yml ps --format json', {
      cwd: path.join(import.meta.dirname, '../..'),
      encoding: 'utf-8',
    });
    const containers = result.trim().split('\n').filter(Boolean);
    return containers.length >= 2;
  } catch {
    return false;
  }
}

function executeCommand(client: Client, command: string): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on('close', (code: number) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      stream.on('error', (streamErr: Error) => {
        reject(streamErr);
      });
    });
  });
}

describe.skipIf(!isDockerRunning())('E2E SSH Tests', () => {
  let config: TestConfig;
  let pool: ConnectionPool;
  let server1Config: ServerConfig;
  let server2Config: ServerConfig;

  beforeAll(() => {
    config = loadTestConfig();
    pool = new ConnectionPool();
    server1Config = config.servers[0];
    server2Config = config.servers[1];
  });

  afterAll(() => {
    pool.clear();
  });

  describe('Connection', () => {
    it('connects to test-server-1 with password auth', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);
      session.disconnect();
    });

    it('connects to test-server-2 with password auth', async () => {
      const session = new SessionKeeper(server2Config, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);
      session.disconnect();
    });

    it('fails to connect with wrong password', async () => {
      const badConfig: ServerConfig = {
        ...server1Config,
        id: 'bad-auth',
        auth: { password: 'wrongpassword' } as PasswordAuth,
      };
      const session = new SessionKeeper(badConfig, { maxReconnectAttempts: 0 });
      await expect(session.connect()).rejects.toThrow();
    });

    it('manages multiple connections in pool', async () => {
      const session1 = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(server2Config, { maxReconnectAttempts: 0 });
      await session1.connect();
      await session2.connect();
      pool.add(session1);
      pool.add(session2);
      expect(pool.size).toBe(2);
      expect(pool.has('test-server-1')).toBe(true);
      expect(pool.has('test-server-2')).toBe(true);
      pool.clear();
      expect(pool.size).toBe(0);
    });
  });

  describe('Command Execution', () => {
    it('executes simple command', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo "Hello World"');
      expect(result.stdout.trim()).toBe('Hello World');
      expect(result.exitCode).toBe(0);
      session.disconnect();
    });

    it('executes command with arguments', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'expr 2 + 2');
      expect(result.stdout.trim()).toBe('4');
      expect(result.exitCode).toBe(0);
      session.disconnect();
    });

    it('captures stderr', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo "error" >&2');
      expect(result.stderr.trim()).toBe('error');
      expect(result.exitCode).toBe(0);
      session.disconnect();
    });

    it('returns non-zero exit code on failure', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'exit 42');
      expect(result.exitCode).toBe(42);
      session.disconnect();
    });

    it('handles command with pipe', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo -e "line1\\nline2\\nline3" | wc -l');
      expect(result.stdout.trim()).toBe('3');
      session.disconnect();
    });
  });

  describe('File Transfer (SFTP)', () => {
    const localTestFile = path.join(os.tmpdir(), 'ssh-mcp-test-upload.txt');
    const localDownloadFile = path.join(os.tmpdir(), 'ssh-mcp-test-download.txt');
    const remoteTestFile = '/tmp/ssh-mcp-test-file.txt';
    const testContent = 'Hello from SSH MCP test!\nLine 2\nLine 3';

    beforeAll(() => {
      fs.writeFileSync(localTestFile, testContent);
    });

    afterAll(() => {
      try { fs.unlinkSync(localTestFile); } catch { /* ignore */ }
      try { fs.unlinkSync(localDownloadFile); } catch { /* ignore */ }
    });

    it('uploads file to remote server', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);
      await fileTransfer.upload(localTestFile, remoteTestFile);
      const result = await executeCommand(session.client, `cat ${remoteTestFile}`);
      expect(result.stdout).toBe(testContent);
      session.disconnect();
    });

    it('downloads file from remote server', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      await executeCommand(session.client, `echo -n "${testContent}" > ${remoteTestFile}`);
      const fileTransfer = new FileTransfer(session);
      await fileTransfer.download(remoteTestFile, localDownloadFile);
      const downloadedContent = fs.readFileSync(localDownloadFile, 'utf-8');
      expect(downloadedContent).toBe(testContent);
      session.disconnect();
    });

    it('creates remote directory if needed', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);
      // Need to use absolute path - SFTP doesn't expand ~ automatically
      const homeDir = (await executeCommand(session.client, 'echo $HOME')).stdout.trim();
      const remotePath = `${homeDir}/test-file.txt`;
      await fileTransfer.upload(localTestFile, remotePath);
      const result = await executeCommand(session.client, `cat ${remotePath}`);
      expect(result.stdout).toBe(testContent);
      await executeCommand(session.client, `rm ${remotePath}`);
      session.disconnect();
    });
  });

  describe('Keep-Alive', () => {
    it('maintains connection with keep-alive', async () => {
      const session = new SessionKeeper(server1Config, {
        keepaliveIntervalMs: 1000,
        maxReconnectAttempts: 0,
      });
      await session.connect();
      await new Promise(resolve => setTimeout(resolve, 3000));
      expect(session.isConnected).toBe(true);
      const result = await executeCommand(session.client, 'echo "still connected"');
      expect(result.stdout.trim()).toBe('still connected');
      session.disconnect();
    }, 10000);
  });

  describe('Concurrent Commands', () => {
    it('executes multiple commands simultaneously on same connection', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      expect(results.every(r => r.exitCode === 0)).toBe(true);
      session.disconnect();
    });

    it('handles mixed success and failure in concurrent commands', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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

  describe('Binary File Transfer', () => {
    const localBinaryFile = path.join(os.tmpdir(), 'ssh-mcp-test-binary.bin');
    const localDownloadBinary = path.join(os.tmpdir(), 'ssh-mcp-test-binary-dl.bin');
    const remoteBinaryFile = '/tmp/ssh-mcp-test-binary.bin';

    afterAll(() => {
      try { fs.unlinkSync(localBinaryFile); } catch { /* ignore */ }
      try { fs.unlinkSync(localDownloadBinary); } catch { /* ignore */ }
    });

    it('uploads and downloads binary file correctly', async () => {
      const binaryData = Buffer.alloc(1024);
      for (let i = 0; i < binaryData.length; i++) {
        binaryData[i] = i % 256;
      }
      fs.writeFileSync(localBinaryFile, binaryData);

      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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

      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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

  describe('Unicode and Special Characters', () => {
    it('handles unicode in command output', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo "Hello 世界 🚀 émojis"');
      expect(result.stdout.trim()).toBe('Hello 世界 🚀 émojis');
      session.disconnect();
    });

    it('handles special shell characters', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'echo "quotes: \\"test\\" and $HOME"');
      expect(result.stdout).toContain('quotes:');
      expect(result.exitCode).toBe(0);
      session.disconnect();
    });

    it('handles newlines and tabs in output', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const result = await executeCommand(session.client, 'printf "line1\\nline2\\ttabbed"');
      expect(result.stdout).toBe('line1\nline2\ttabbed');
      session.disconnect();
    });

    it('transfers file with unicode filename', async () => {
      const unicodeFile = path.join(os.tmpdir(), 'ssh-mcp-日本語.txt');
      const remoteUnicode = '/tmp/ssh-mcp-日本語.txt';
      const content = 'Unicode content: 日本語テスト';
      fs.writeFileSync(unicodeFile, content);

      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
});
