// FileTransfer download tests: file downloads, path handling, size limits.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerConfig } from '../../../src/config/types.js';
import { MockSFTPWrapper, clearMockInstances, getMockClient } from './_fixtures/sftp-test.mocks.js';
import { createSftpServerConfig, setupConnectedClient } from './_fixtures/sftp-test.helpers.js';

const mockClientInstances: EventEmitter[] = [];

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

vi.mock('ssh2', () => ({ Client: MockClient }));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600, size: 1024 })),
}));

import { FileTransfer, MAX_FILE_SIZE } from '../../../src/ssh/sftp.js';

describe('FileTransfer download', () => {
  let serverConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockClientInstances);
    serverConfig = createSftpServerConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads file successfully', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            setImmediate(() => cb(null, { size: 1024 }));
          },
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, cb: (err: Error | null) => void) => {
            setImmediate(() => cb(null));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await expect(
      fileTransfer.download('/remote/file.txt', '/local/file.txt'),
    ).resolves.toBeUndefined();
  });

  it('throws on remote file not found', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            const err = new Error('No such file') as Error & { code?: string };
            err.code = 'ENOENT';
            setImmediate(() => cb(err, null));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await expect(fileTransfer.download('/remote/missing.txt', '/local/file.txt')).rejects.toThrow(
      /not found/i,
    );
  });

  it('throws on remote file too large', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            setImmediate(() => cb(null, { size: MAX_FILE_SIZE + 1 }));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await expect(fileTransfer.download('/remote/large.bin', '/local/large.bin')).rejects.toThrow(
      /file too large/i,
    );
  });

  it('expands ~ in remote paths for download', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    let capturedRemotePath = '';
    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            capturedRemotePath = _path;
            setImmediate(() => cb(null, { size: 1024 }));
          },
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, cb: (err: Error | null) => void) => {
            setImmediate(() => cb(null));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await fileTransfer.download('~/documents/file.txt', '/local/file.txt');
    expect(capturedRemotePath).toBe('/home/testuser/documents/file.txt');
  });

  it('handles special characters in paths for download', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    let capturedRemotePath = '';
    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            capturedRemotePath = _path;
            setImmediate(() => cb(null, { size: 1024 }));
          },
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, cb: (err: Error | null) => void) => {
            setImmediate(() => cb(null));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await fileTransfer.download('/remote/file with spaces.txt', '/local/file.txt');
    expect(capturedRemotePath).toBe('/remote/file with spaces.txt');
  });

  it('throws on permission denied for download', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            setImmediate(() => cb(null, { size: 1024 }));
          },
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, cb: (err: Error | null) => void) => {
            const err = new Error('Permission denied') as Error & { code?: string };
            err.code = 'EACCES';
            setImmediate(() => cb(err));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await expect(fileTransfer.download('/remote/protected.txt', '/local/file.txt')).rejects.toThrow(
      /permission denied/i,
    );
  });
});
