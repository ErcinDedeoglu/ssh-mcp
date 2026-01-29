// FileTransfer upload tests: file uploads, path handling, directory creation.
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
import * as fs from 'node:fs';

describe('FileTransfer upload', () => {
  let serverConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockClientInstances);
    serverConfig = createSftpServerConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads file successfully', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            setImmediate(() => cb(null));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await expect(
      fileTransfer.upload('/local/file.txt', '/remote/file.txt'),
    ).resolves.toBeUndefined();
  });

  it('throws on file too large', async () => {
    const { connection } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    vi.mocked(fs.statSync).mockReturnValue({
      mode: 0o100600,
      size: MAX_FILE_SIZE + 1,
    } as fs.Stats);

    await expect(fileTransfer.upload('/local/large.bin', '/remote/large.bin')).rejects.toThrow(
      /file too large/i,
    );
  });

  it('throws on local file not found', async () => {
    const { connection } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(fileTransfer.upload('/local/missing.txt', '/remote/file.txt')).rejects.toThrow(
      /not found/i,
    );
  });

  it('handles special characters in paths', async () => {
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
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            capturedRemotePath = _remote;
            setImmediate(() => cb(null));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await fileTransfer.upload('/local/file with spaces.txt', '/remote/file with spaces.txt');
    expect(capturedRemotePath).toBe('/remote/file with spaces.txt');
  });

  it('expands ~ in remote paths', async () => {
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
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            capturedRemotePath = _remote;
            setImmediate(() => cb(null));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await fileTransfer.upload('/local/file.txt', '~/documents/file.txt');
    expect(capturedRemotePath).toBe('/home/testuser/documents/file.txt');
  });

  it('throws on SFTP subsystem error', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper | null) => void) => {
        setImmediate(() => callback(new Error('SFTP subsystem not available'), null));
      },
    );

    await expect(fileTransfer.upload('/local/file.txt', '/remote/file.txt')).rejects.toThrow(
      /SFTP subsystem/i,
    );
  });

  it('throws on permission denied', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            const err = new Error('Permission denied') as Error & { code?: string };
            err.code = 'EACCES';
            setImmediate(() => cb(err));
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await expect(
      fileTransfer.upload('/local/file.txt', '/remote/protected/file.txt'),
    ).rejects.toThrow(/permission denied/i);
  });
});
