// FileTransfer upload tests: path expansion and special character handling.
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

import { FileTransfer } from '../../../src/ssh/sftp.js';

describe('FileTransfer upload path handling', () => {
  let serverConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockClientInstances);
    serverConfig = createSftpServerConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
