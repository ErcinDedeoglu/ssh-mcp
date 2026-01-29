// Tests for list_servers MCP tool
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
        description: 'Test server',
        auth: { password: 'test' },
      },
    ],
  })),
}));

describe('list_servers', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
  });

  it('returns all configured servers', async () => {
    const { registerListServersTool } = await import('../../../src/tools/list-servers.js');

    const mockServer = createMockServer();
    registerListServersTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    expect(mockServer.tool).toHaveBeenCalledWith(
      'list_servers',
      expect.any(String),
      expect.any(Function),
    );

    const handler = mockServer.getToolHandler('list_servers')!;
    const result = await handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('test-server');
    expect(parsed[0].host).toBe('192.168.1.100');
    expect(parsed[0].port).toBe(22);
    expect(parsed[0].username).toBe('ubuntu');
    expect(parsed[0].description).toBe('Test server');
  });

  it('includes connection status for each server', async () => {
    const { registerListServersTool } = await import('../../../src/tools/list-servers.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerListServersTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    const handler = mockServer.getToolHandler('list_servers')!;
    const result = await handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].connected).toBe(true);
  });
});
