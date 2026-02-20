import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../../../src/config/types.js';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import type { ErrorCallback } from './_fixtures/types.js';

const mockInstances: EventEmitter[] = [];
let mockConfig: Config;

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');
  class MockClient extends EE {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    sftp = vi.fn();
    constructor() {
      super();
      mockInstances.push(this);
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
vi.mock('../../../src/config/loader.js', () => ({
  loadConfig: () => JSON.parse(JSON.stringify(mockConfig)),
}));

describe('download', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
  });

  it('downloads file via SFTP', async () => {
    const { registerDownloadTool } = await import('../../../src/tools/download.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockSftp = {
      realpath: vi.fn((_p: string, cb: ErrorCallback) => cb(null, '/home/testuser')),
      stat: vi.fn((_path: string, callback: ErrorCallback) => {
        callback(null, { size: 1024 });
      }),
      fastGet: vi.fn((_remote: string, _local: string, callback: ErrorCallback) => {
        callback(null);
      }),
    };
    mockClient.sftp.mockImplementation((callback: ErrorCallback) => {
      callback(null, mockSftp);
    });

    const mockServer = createMockServer();
    registerDownloadTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('download')!;
    const result = await handler({
      serverId: 'test-server',
      remotePath: '~/data/file.txt',
      localPath: '/tmp/downloaded.txt',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('downloaded');
  });

  it('validates remote file size', async () => {
    const { registerDownloadTool } = await import('../../../src/tools/download.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockSftp = {
      realpath: vi.fn((_p: string, cb: ErrorCallback) => cb(null, '/home/testuser')),
      stat: vi.fn((_path: string, callback: ErrorCallback) => {
        callback(null, { size: 200 * 1024 * 1024 });
      }),
    };
    mockClient.sftp.mockImplementation((callback: ErrorCallback) => {
      callback(null, mockSftp);
    });

    const mockServer = createMockServer();
    registerDownloadTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('download')!;
    const result = await handler({
      serverId: 'test-server',
      remotePath: '~/data/large.bin',
      localPath: '/tmp/large.bin',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('too large');
  });
});
