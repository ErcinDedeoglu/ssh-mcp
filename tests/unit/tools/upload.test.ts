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

describe('upload', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
  });

  it('uploads file via SFTP', async () => {
    const { registerUploadTool } = await import('../../../src/tools/upload.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockSftp = {
      fastPut: vi.fn((_local: string, _remote: string, callback: ErrorCallback) => {
        callback(null);
      }),
    };
    mockClient.sftp.mockImplementation((callback: ErrorCallback) => {
      callback(null, mockSftp);
    });

    const mockServer = createMockServer();
    registerUploadTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('upload')!;
    const result = await handler({
      serverId: 'test-server',
      localPath: '/tmp/test.txt',
      remotePath: '~/uploads/test.txt',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('uploaded');
  });

  it('validates file size', async () => {
    const fs = await import('node:fs');
    (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
      mode: 0o100600,
      size: 200 * 1024 * 1024,
    });

    const { registerUploadTool } = await import('../../../src/tools/upload.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerUploadTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('upload')!;
    const result = await handler({
      serverId: 'test-server',
      localPath: '/tmp/large.bin',
      remotePath: '~/uploads/large.bin',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('too large');
  });
});
