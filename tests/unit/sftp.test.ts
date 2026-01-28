import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerConfig, PasswordAuth } from '../../src/config/types.js';

// Track mock instances for both Client and SFTPWrapper
const mockClientInstances: EventEmitter[] = [];
const mockSftpInstances: EventEmitter[] = [];

// Mock SFTP wrapper with fastPut/fastGet methods
class MockSFTPWrapper extends EventEmitter {
  fastPut = vi.fn();
  fastGet = vi.fn();
  mkdir = vi.fn();
  stat = vi.fn();

  constructor() {
    super();
    mockSftpInstances.push(this);
  }
}

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as typeof import('node:events');
  
  class MockClient extends EventEmitter {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    sftp = vi.fn();

    constructor() {
      super();
      mockClientInstances.push(this);
    }
  }
  
  return { MockClient };
});

vi.mock('ssh2', () => ({
  Client: MockClient,
}));

// Mock node:fs for file size checks
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600, size: 1024 })), // 1KB default
}));

import { SessionKeeper } from '../../src/ssh/session.js';
import { FileTransfer, MAX_FILE_SIZE } from '../../src/ssh/sftp.js';
import * as fs from 'node:fs';

function clearMockInstances(): void {
  mockClientInstances.length = 0;
  mockSftpInstances.length = 0;
}

function getMockClient(index = 0): EventEmitter & {
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  sftp: ReturnType<typeof vi.fn>;
} {
  return mockClientInstances[index] as EventEmitter & {
    connect: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    sftp: ReturnType<typeof vi.fn>;
  };
}

function getMockSftp(index = 0): MockSFTPWrapper {
  return mockSftpInstances[index] as MockSFTPWrapper;
}

describe('FileTransfer', () => {
  let serverConfig: ServerConfig;
  let connection: SessionKeeper;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances();

    serverConfig = {
      id: 'test-server',
      host: '192.168.1.100',
      port: 22,
      username: 'testuser',
      auth: { password: 'secret123' } as PasswordAuth,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setupConnectedClient(): Promise<{
    connection: SessionKeeper;
    mockClient: ReturnType<typeof getMockClient>;
    mockSftp: MockSFTPWrapper;
  }> {
    connection = new SessionKeeper(serverConfig);
    const mockClient = getMockClient();

    // Setup sftp mock to create MockSFTPWrapper
    mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
      const sftpWrapper = new MockSFTPWrapper();
      setImmediate(() => callback(null, sftpWrapper));
    });

    const connectPromise = connection.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    return { connection, mockClient, mockSftp: getMockSftp() };
  }

  describe('upload', () => {
    it('uploads file successfully', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      // Reset sftp mock to capture the real callback
      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            setImmediate(() => cb(null));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await expect(fileTransfer.upload('/local/file.txt', '/remote/file.txt')).resolves.toBeUndefined();
    });

    it('throws on file too large', async () => {
      const { connection } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      // Mock file size over 100MB
      vi.mocked(fs.statSync).mockReturnValue({
        mode: 0o100600,
        size: MAX_FILE_SIZE + 1,
      } as fs.Stats);

      await expect(fileTransfer.upload('/local/large.bin', '/remote/large.bin')).rejects.toThrow(
        /file too large/i
      );
    });

    it('throws on local file not found', async () => {
      const { connection } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(fileTransfer.upload('/local/missing.txt', '/remote/file.txt')).rejects.toThrow(
        /not found/i
      );
    });

    it('handles special characters in paths', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      let capturedRemotePath = '';
      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            capturedRemotePath = _remote;
            setImmediate(() => cb(null));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await fileTransfer.upload('/local/file with spaces.txt', '/remote/file with spaces.txt');
      expect(capturedRemotePath).toBe('/remote/file with spaces.txt');
    });

    it('expands ~ in remote paths', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      let capturedRemotePath = '';
      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            capturedRemotePath = _remote;
            setImmediate(() => cb(null));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await fileTransfer.upload('/local/file.txt', '~/documents/file.txt');
      expect(capturedRemotePath).toBe('/home/testuser/documents/file.txt');
    });

    it('throws on SFTP subsystem error', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper | null) => void) => {
        setImmediate(() => callback(new Error('SFTP subsystem not available'), null));
      });

      await expect(fileTransfer.upload('/local/file.txt', '/remote/file.txt')).rejects.toThrow(
        /SFTP subsystem/i
      );
    });

    it('throws on permission denied', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            const err = new Error('Permission denied') as Error & { code?: string };
            err.code = 'EACCES';
            setImmediate(() => cb(err));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await expect(fileTransfer.upload('/local/file.txt', '/remote/protected/file.txt')).rejects.toThrow(
        /permission denied/i
      );
    });

    it('creates remote directory if needed', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      let mkdirCalled = false;
      let mkdirPath = '';

      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        let firstAttempt = true;

        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            if (firstAttempt) {
              firstAttempt = false;
              const err = new Error('No such file') as Error & { code?: string };
              err.code = 'ENOENT';
              setImmediate(() => cb(err));
            } else {
              setImmediate(() => cb(null));
            }
          }
        );

        sftpWrapper.mkdir.mockImplementation(
          (_path: string, opts: { mode: number } | ((err: Error | null) => void), cb?: (err: Error | null) => void) => {
            mkdirCalled = true;
            mkdirPath = _path;
            const callback = typeof opts === 'function' ? opts : cb!;
            setImmediate(() => callback(null));
          }
        );

        setImmediate(() => callback(null, sftpWrapper));
      });

      await fileTransfer.upload('/local/file.txt', '/remote/new/dir/file.txt');
      expect(mkdirCalled).toBe(true);
      expect(mkdirPath).toBe('/remote/new/dir');
    });
  });

  describe('download', () => {
    it('downloads file successfully', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            setImmediate(() => cb(null, { size: 1024 }));
          }
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, cb: (err: Error | null) => void) => {
            setImmediate(() => cb(null));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await expect(fileTransfer.download('/remote/file.txt', '/local/file.txt')).resolves.toBeUndefined();
    });

    it('throws on remote file not found', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            const err = new Error('No such file') as Error & { code?: string };
            err.code = 'ENOENT';
            setImmediate(() => cb(err, null));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await expect(fileTransfer.download('/remote/missing.txt', '/local/file.txt')).rejects.toThrow(
        /not found/i
      );
    });

    it('throws on remote file too large', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            setImmediate(() => cb(null, { size: MAX_FILE_SIZE + 1 }));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await expect(fileTransfer.download('/remote/large.bin', '/local/large.bin')).rejects.toThrow(
        /file too large/i
      );
    });

    it('expands ~ in remote paths for download', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      let capturedRemotePath = '';
      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            capturedRemotePath = _path;
            setImmediate(() => cb(null, { size: 1024 }));
          }
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, cb: (err: Error | null) => void) => {
            setImmediate(() => cb(null));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await fileTransfer.download('~/documents/file.txt', '/local/file.txt');
      expect(capturedRemotePath).toBe('/home/testuser/documents/file.txt');
    });

    it('handles special characters in paths for download', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      let capturedRemotePath = '';
      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            capturedRemotePath = _path;
            setImmediate(() => cb(null, { size: 1024 }));
          }
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, cb: (err: Error | null) => void) => {
            setImmediate(() => cb(null));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await fileTransfer.download('/remote/file with spaces.txt', '/local/file.txt');
      expect(capturedRemotePath).toBe('/remote/file with spaces.txt');
    });

    it('throws on permission denied for download', async () => {
      const { connection, mockClient } = await setupConnectedClient();
      const fileTransfer = new FileTransfer(connection);

      mockClient.sftp.mockImplementation((callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            setImmediate(() => cb(null, { size: 1024 }));
          }
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, cb: (err: Error | null) => void) => {
            const err = new Error('Permission denied') as Error & { code?: string };
            err.code = 'EACCES';
            setImmediate(() => cb(err));
          }
        );
        setImmediate(() => callback(null, sftpWrapper));
      });

      await expect(fileTransfer.download('/remote/protected.txt', '/local/file.txt')).rejects.toThrow(
        /permission denied/i
      );
    });
  });

  describe('MAX_FILE_SIZE constant', () => {
    it('exports MAX_FILE_SIZE as 100MB', () => {
      expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
    });
  });
});
