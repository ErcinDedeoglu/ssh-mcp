// Tests for connection_status MCP tool
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

describe('connection_status', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
  });

  it('returns health status for connected server', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as unknown as McpServer, ctx.pool);

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'test-server' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.connected).toBe(true);
    expect(parsed.idle).toBe(false);
    expect(parsed.reconnecting).toBe(false);
    expect(parsed.lastActivityMs).toBeGreaterThan(0);
  });

  it('returns not connected for unknown server', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as unknown as McpServer, ctx.pool);

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'unknown-server' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.connected).toBe(false);
    expect(parsed.message).toBe('No active connection');
  });

  it('includes reconnect attempt when reconnecting', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig, { baseReconnectDelayMs: 1000 });
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockClient.emit('close');
    await new Promise((resolve) => setTimeout(resolve, 10));

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as unknown as McpServer, ctx.pool);

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'test-server' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reconnecting).toBe(true);
    expect(parsed.reconnectAttempt).toBe(1);
  });
});
