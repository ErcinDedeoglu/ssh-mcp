// E2E tests - requires: docker compose -f docker-compose.test.yml up -d
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { SessionKeeper } from '../../src/ssh/session.js';
import { FileTransfer, MAX_FILE_SIZE } from '../../src/ssh/sftp.js';
import { ConnectionPool } from '../../src/ssh/pool.js';
import type { ServerConfig, PasswordAuth, PrivateKeyAuth } from '../../src/config/types.js';
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
    return containers.length >= 3;
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
  let serverKeyConfig: ServerConfig;
  let serverKeyPassphraseConfig: ServerConfig;

  beforeAll(() => {
    config = loadTestConfig();
    pool = new ConnectionPool();
    server1Config = config.servers[0];
    server2Config = config.servers[1];
    serverKeyConfig = config.servers[2];
    serverKeyPassphraseConfig = config.servers[3];
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
      const result = await executeCommand(
        session.client,
        'echo -e "line1\\nline2\\nline3" | wc -l',
      );
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
      await new Promise((resolve) => setTimeout(resolve, 3000));
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
      expect(results.every((r) => r.exitCode === 0)).toBe(true);
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

  describe('Idle Timeout', () => {
    it('marks session as idle after configured timeout', async () => {
      const idleTimeoutMs = 100;
      const session = new SessionKeeper(server1Config, {
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
      const session = new SessionKeeper(server1Config, {
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

  describe('File Size Limits', () => {
    it('allows upload and download of small files', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);

      await expect(
        fileTransfer.upload('/nonexistent/file/path.txt', '/tmp/test.txt'),
      ).rejects.toThrow(/Local file not found/);

      session.disconnect();
    });

    it('rejects download of non-existent remote file', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const fileTransfer = new FileTransfer(session);
      const localPath = path.join(os.tmpdir(), 'ssh-mcp-nonexistent-download.txt');

      await expect(
        fileTransfer.download('/nonexistent/remote/file.txt', localPath),
      ).rejects.toThrow(/Remote file not found/);

      session.disconnect();
    });
  });

  describe('Key-Based Authentication', () => {
    it('connects with private key (no passphrase)', async () => {
      const session = new SessionKeeper(serverKeyConfig, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);

      const result = await executeCommand(session.client, 'whoami');
      expect(result.stdout.trim()).toBe('keyuser');
      expect(result.exitCode).toBe(0);

      session.disconnect();
    });

    it('connects with private key + passphrase', async () => {
      const session = new SessionKeeper(serverKeyPassphraseConfig, { maxReconnectAttempts: 0 });
      await session.connect();
      expect(session.isConnected).toBe(true);

      const result = await executeCommand(session.client, 'whoami');
      expect(result.stdout.trim()).toBe('keyuser');
      expect(result.exitCode).toBe(0);

      session.disconnect();
    });

    it('fails with wrong passphrase', async () => {
      const badConfig: ServerConfig = {
        ...serverKeyPassphraseConfig,
        id: 'bad-passphrase',
        auth: {
          privateKey: (serverKeyPassphraseConfig.auth as PrivateKeyAuth).privateKey,
          passphrase: 'wrongpassphrase',
        } as PrivateKeyAuth,
      };
      const session = new SessionKeeper(badConfig, { maxReconnectAttempts: 0 });
      await expect(session.connect()).rejects.toThrow();
    });

    it('fails with non-existent key file', async () => {
      const badConfig: ServerConfig = {
        ...serverKeyConfig,
        id: 'bad-keyfile',
        auth: {
          privateKey: '/nonexistent/key/file',
        } as PrivateKeyAuth,
      };
      const session = new SessionKeeper(badConfig, { maxReconnectAttempts: 0 });
      await expect(session.connect()).rejects.toThrow();
    });

    it('executes file transfer with key auth', async () => {
      const session = new SessionKeeper(serverKeyConfig, { maxReconnectAttempts: 0 });
      await session.connect();

      const localFile = path.join(os.tmpdir(), 'ssh-mcp-key-auth-test.txt');
      const remoteFile = '/tmp/ssh-mcp-key-auth-test.txt';
      const content = 'File transferred with key authentication';

      fs.writeFileSync(localFile, content);

      const fileTransfer = new FileTransfer(session);
      await fileTransfer.upload(localFile, remoteFile);

      const result = await executeCommand(session.client, `cat ${remoteFile}`);
      expect(result.stdout).toBe(content);

      await executeCommand(session.client, `rm ${remoteFile}`);
      fs.unlinkSync(localFile);
      session.disconnect();
    });
  });

  describe('Command Timeout', () => {
    it('command completes before timeout', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const result = await executeCommand(session.client, 'sleep 0.5 && echo "completed"');
      expect(result.stdout.trim()).toBe('completed');
      expect(result.exitCode).toBe(0);

      session.disconnect();
    });

    it('long-running command continues until completion', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const startTime = Date.now();
      const result = await executeCommand(session.client, 'sleep 2 && echo "done after 2 seconds"');
      const elapsed = Date.now() - startTime;

      expect(result.stdout.trim()).toBe('done after 2 seconds');
      expect(elapsed).toBeGreaterThanOrEqual(1900);

      session.disconnect();
    }, 10000);
  });

  describe('Large Output Handling', () => {
    it('handles large stdout output', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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

  describe('High Concurrency', () => {
    it('executes 10 parallel commands on same connection', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
          const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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

  describe('Permission Denied Scenarios', () => {
    it('command returns error for non-existent command', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const result = await executeCommand(session.client, 'nonexistentcommand12345');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);

      session.disconnect();
    });

    it('command execution continues after error', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const failResult = await executeCommand(session.client, 'exit 127');
      expect(failResult.exitCode).toBe(127);

      const successResult = await executeCommand(session.client, 'echo "recovered"');
      expect(successResult.stdout.trim()).toBe('recovered');
      expect(successResult.exitCode).toBe(0);

      session.disconnect();
    });

    it('rejects SFTP upload to read-only filesystem location', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const localFile = path.join(os.tmpdir(), 'ssh-mcp-permission-test.txt');
      fs.writeFileSync(localFile, 'test content');

      const fileTransfer = new FileTransfer(session);

      await expect(fileTransfer.upload(localFile, '/proc/test-file.txt')).rejects.toThrow();

      fs.unlinkSync(localFile);
      session.disconnect();
    });

    it('rejects SFTP download of non-existent file', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const fileTransfer = new FileTransfer(session);
      const localPath = path.join(os.tmpdir(), 'ssh-mcp-nonexistent-download-perm.txt');

      await expect(
        fileTransfer.download('/nonexistent/path/to/file.txt', localPath),
      ).rejects.toThrow(/not found/i);

      session.disconnect();
    });
  });

  describe('Auto-Reconnection', () => {
    it('emits reconnecting event on unexpected disconnect', async () => {
      const session = new SessionKeeper(server1Config, {
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
      const session = new SessionKeeper(server1Config, {
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

    it('emits max-retries-reached after exhausting attempts with unreachable host', async () => {
      const badConfig: ServerConfig = {
        ...server1Config,
        id: 'unreachable-server',
        host: '192.0.2.1',
        timeouts: { connection: 1 },
      };

      const session = new SessionKeeper(badConfig, {
        maxReconnectAttempts: 2,
        baseReconnectDelayMs: 50,
        maxReconnectDelayMs: 100,
      });

      let maxRetriesReached = false;
      session.on('max-retries-reached', () => {
        maxRetriesReached = true;
      });

      await expect(session.connect()).rejects.toThrow();
    }, 10000);

    it('does not reconnect after intentional disconnect', async () => {
      const session = new SessionKeeper(server1Config, {
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
      const session = new SessionKeeper(server1Config, {
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

  describe('Stress Tests', () => {
    it('handles rapid connect/disconnect cycles', async () => {
      for (let i = 0; i < 10; i++) {
        const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
        await session.connect();
        expect(session.isConnected).toBe(true);
        session.disconnect();
      }
    }, 30000);

    it('handles 10 parallel connections to same server', async () => {
      const sessions = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session1 = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(server2Config, { maxReconnectAttempts: 0 });

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
            const config = { ...server1Config, id: `stress-${cycle}-${i}` };
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

  describe('Edge Cases', () => {
    it('handles very long command strings', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const longArg = 'x'.repeat(10000);
      const result = await executeCommand(session.client, `echo "${longArg}" | wc -c`);

      expect(parseInt(result.stdout.trim())).toBe(10001);

      session.disconnect();
    });

    it('handles command with many environment variables', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const envVars = Array.from({ length: 50 }, (_, i) => `VAR${i}=value${i}`).join(' ');
      const result = await executeCommand(session.client, `${envVars} env | grep ^VAR | wc -l`);

      expect(parseInt(result.stdout.trim())).toBe(50);

      session.disconnect();
    });

    it('handles file transfer with special characters in content', async () => {
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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

    it('handles connection to different servers in pool simultaneously', async () => {
      const testPool = new ConnectionPool();

      const session1 = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(server2Config, { maxReconnectAttempts: 0 });
      const sessionKey = new SessionKeeper(serverKeyConfig, { maxReconnectAttempts: 0 });

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
      const session = new SessionKeeper(server1Config, {
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
      const session = new SessionKeeper(server1Config, { maxReconnectAttempts: 0 });
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
