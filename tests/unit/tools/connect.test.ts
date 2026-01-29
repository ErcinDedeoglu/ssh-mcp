// Tests for connect MCP tool
import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';

const mockInstances: EventEmitter[] = [];

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
  loadConfig: vi.fn(() => ({
    servers: [
      {
        id: 'test-server',
        host: '192.168.1.100',
        port: 22,
        username: 'ubuntu',
        auth: { privateKey: '~/.ssh/id_rsa' },
      },
    ],
  })),
}));

describe('connect', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
  });

  it('connects to a server and adds to pool', async () => {
    const { registerConnectTool } = await import('../../../src/tools/connect.js');

    const mockServer = createMockServer();
    registerConnectTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('connect')!;

    const resultPromise = handler({ serverId: 'test-server' });
    await new Promise((resolve) => setImmediate(resolve));
    (getMockClient(mockInstances) as MockClientType).emit('ready');

    const result = await resultPromise;

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('connected');
    expect(parsed.serverId).toBe('test-server');
    expect(ctx.pool.has('test-server')).toBe(true);
  });

  it('returns already_connected if connection exists', async () => {
    const { registerConnectTool } = await import('../../../src/tools/connect.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerConnectTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('connect')!;
    const result = await handler({ serverId: 'test-server' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('already_connected');
  });

  it('returns error for unknown server', async () => {
    const { registerConnectTool } = await import('../../../src/tools/connect.js');

    const mockServer = createMockServer();
    registerConnectTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('connect')!;
    const result = await handler({ serverId: 'unknown-server' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
