// FileTransfer timeout tests: transfer timeouts, SFTP init timeouts, constants.
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

import { FileTransfer, MAX_FILE_SIZE, DEFAULT_TRANSFER_TIMEOUT_MS } from '../../../src/ssh/sftp.js';

describe('FileTransfer constants', () => {
  it('exports MAX_FILE_SIZE as 100MB', () => {
    expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  });

  it('exports DEFAULT_TRANSFER_TIMEOUT_MS as 5 minutes', () => {
    expect(DEFAULT_TRANSFER_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });
});

describe('FileTransfer timeout', () => {
  let serverConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockClientInstances);
    serverConfig = createSftpServerConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('times out on slow upload', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection, { timeoutMs: 50 });

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, _cb: (err: Error | null) => void) => {},
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await expect(fileTransfer.upload('/local/file.txt', '/remote/file.txt')).rejects.toThrow(
      /timed out/i,
    );
  });

  it('times out on slow download', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection, { timeoutMs: 50 });

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            setImmediate(() => cb(null, { size: 1024 }));
          },
        );
        sftpWrapper.fastGet.mockImplementation(
          (_remote: string, _local: string, _cb: (err: Error | null) => void) => {},
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await expect(fileTransfer.download('/remote/file.txt', '/local/file.txt')).rejects.toThrow(
      /timed out/i,
    );
  });

  it('times out on slow SFTP initialization', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection, { timeoutMs: 50 });

    mockClient.sftp.mockImplementation(
      (_callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {},
    );

    await expect(fileTransfer.upload('/local/file.txt', '/remote/file.txt')).rejects.toThrow(
      /timed out/i,
    );
  });

  it('uses custom timeout when provided', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const customTimeout = 100;
    const fileTransfer = new FileTransfer(connection, { timeoutMs: customTimeout });

    let callbackCalled = false;
    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            setTimeout(() => {
              callbackCalled = true;
              cb(null);
            }, 50);
          },
        );
        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await fileTransfer.upload('/local/file.txt', '/remote/file.txt');
    expect(callbackCalled).toBe(true);
  });
});
