// FileTransfer tests: cross-platform home directory expansion via sftp.realpath.
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

type RealpathResult = { err: Error | null; path: string };

async function createFt(serverConfig: ServerConfig) {
  const { connection, mockClient } = await setupConnectedClient(
    serverConfig,
    mockClientInstances,
    getMockClient,
  );
  return { ft: new FileTransfer(connection), mockClient };
}

function mockSftp(
  mockClient: ReturnType<typeof getMockClient>,
  rp: RealpathResult,
  capture: { remotePath: string },
  op: 'upload' | 'download',
): void {
  mockClient.sftp.mockImplementation(
    (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
      const w = new MockSFTPWrapper();
      w.realpath.mockImplementation((_p: string, cb: (e: Error | null, a: string) => void) =>
        setImmediate(() => cb(rp.err, rp.path)),
      );
      if (op === 'upload') {
        w.fastPut.mockImplementation((_l: string, _r: string, cb: (e: Error | null) => void) => {
          capture.remotePath = _r;
          setImmediate(() => cb(null));
        });
      } else {
        w.stat.mockImplementation(
          (_p: string, cb: (e: Error | null, s: { size: number } | null) => void) => {
            capture.remotePath = _p;
            setImmediate(() => cb(null, { size: 1024 }));
          },
        );
        w.fastGet.mockImplementation((_r: string, _l: string, cb: (e: Error | null) => void) =>
          setImmediate(() => cb(null)),
        );
      }
      setImmediate(() => callback(null, w));
    },
  );
}

describe('FileTransfer home directory expansion', () => {
  let serverConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockClientInstances);
    serverConfig = createSftpServerConfig();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('Windows SSH server (Win32-OpenSSH)', () => {
    const winHome = { err: null, path: '/C:/Users/admin' };

    it('expands ~ using Windows home dir for upload', async () => {
      const { ft, mockClient } = await createFt(serverConfig);
      const cap = { remotePath: '' };
      mockSftp(mockClient, winHome, cap, 'upload');
      await ft.upload('/local/file.txt', '~/docs/file.txt');
      expect(cap.remotePath).toBe('/C:/Users/admin/docs/file.txt');
    });

    it('expands ~ using Windows home dir for download', async () => {
      const { ft, mockClient } = await createFt(serverConfig);
      const cap = { remotePath: '' };
      mockSftp(mockClient, winHome, cap, 'download');
      await ft.download('~/docs/file.txt', '/local/file.txt');
      expect(cap.remotePath).toBe('/C:/Users/admin/docs/file.txt');
    });

    it('expands bare ~ to Windows home dir', async () => {
      const { ft, mockClient } = await createFt(serverConfig);
      const cap = { remotePath: '' };
      mockSftp(mockClient, winHome, cap, 'upload');
      await ft.upload('/local/file.txt', '~');
      expect(cap.remotePath).toBe('/C:/Users/admin');
    });
  });

  describe('macOS SSH server', () => {
    it('expands ~ using /Users/username home dir', async () => {
      const { ft, mockClient } = await createFt(serverConfig);
      const cap = { remotePath: '' };
      mockSftp(mockClient, { err: null, path: '/Users/testuser' }, cap, 'upload');
      await ft.upload('/local/file.txt', '~/Desktop/file.txt');
      expect(cap.remotePath).toBe('/Users/testuser/Desktop/file.txt');
    });
  });

  describe('realpath fallback', () => {
    it('falls back to /home/username when realpath fails', async () => {
      const { ft, mockClient } = await createFt(serverConfig);
      const cap = { remotePath: '' };
      mockSftp(mockClient, { err: new Error('not supported'), path: '' }, cap, 'upload');
      await ft.upload('/local/file.txt', '~/docs/file.txt');
      expect(cap.remotePath).toBe('/home/testuser/docs/file.txt');
    });

    it('falls back to /home/username when realpath returns empty', async () => {
      const { ft, mockClient } = await createFt(serverConfig);
      const cap = { remotePath: '' };
      mockSftp(mockClient, { err: null, path: '' }, cap, 'upload');
      await ft.upload('/local/file.txt', '~/docs/file.txt');
      expect(cap.remotePath).toBe('/home/testuser/docs/file.txt');
    });
  });

  describe('non-tilde paths skip realpath', () => {
    it('does not call realpath for absolute paths', async () => {
      const { ft, mockClient } = await createFt(serverConfig);
      let realpathCalled = false;
      mockClient.sftp.mockImplementation(
        (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
          const w = new MockSFTPWrapper();
          w.realpath.mockImplementation(() => {
            realpathCalled = true;
          });
          w.fastPut.mockImplementation((_l: string, _r: string, cb: (e: Error | null) => void) =>
            setImmediate(() => cb(null)),
          );
          setImmediate(() => callback(null, w));
        },
      );
      await ft.upload('/local/file.txt', '/remote/file.txt');
      expect(realpathCalled).toBe(false);
    });
  });
});
