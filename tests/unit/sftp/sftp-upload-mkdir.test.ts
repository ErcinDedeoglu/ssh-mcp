// FileTransfer upload test: remote directory auto-creation behavior.
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

describe('FileTransfer upload directory creation', () => {
  let serverConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockClientInstances);
    serverConfig = createSftpServerConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates remote directory if needed', async () => {
    const { connection, mockClient } = await setupConnectedClient(
      serverConfig,
      mockClientInstances,
      getMockClient,
    );
    const fileTransfer = new FileTransfer(connection);

    const createdDirs: string[] = [];

    mockClient.sftp.mockImplementation(
      (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
        const sftpWrapper = new MockSFTPWrapper();
        let firstAttempt = true;
        const existingDirs = new Set<string>(['/remote']);

        sftpWrapper.fastPut.mockImplementation(
          (_local: string, _remote: string, cb: (err: Error | null) => void) => {
            if (firstAttempt) {
              firstAttempt = false;
              const err = new Error('No such file') as Error & { code?: number };
              err.code = 2;
              setImmediate(() => cb(err));
            } else {
              setImmediate(() => cb(null));
            }
          },
        );

        sftpWrapper.stat.mockImplementation(
          (_path: string, cb: (err: Error | null, stats: { size: number } | null) => void) => {
            if (existingDirs.has(_path)) {
              setImmediate(() => cb(null, { size: 0 }));
            } else {
              const err = new Error('No such file') as Error & { code?: number };
              err.code = 2;
              setImmediate(() => cb(err, null));
            }
          },
        );

        sftpWrapper.mkdir.mockImplementation((_path: string, cb: (err: Error | null) => void) => {
          createdDirs.push(_path);
          existingDirs.add(_path);
          setImmediate(() => cb(null));
        });

        setImmediate(() => callback(null, sftpWrapper));
      },
    );

    await fileTransfer.upload('/local/file.txt', '/remote/new/dir/file.txt');
    expect(createdDirs).toContain('/remote/new');
    expect(createdDirs).toContain('/remote/new/dir');
  });
});
