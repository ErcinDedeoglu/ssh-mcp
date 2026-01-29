// Tests for disconnect MCP tool
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

describe('disconnect', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
  });

  it('disconnects and removes from pool', async () => {
    const { registerDisconnectTool } = await import('../../../src/tools/disconnect.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerDisconnectTool(mockServer as unknown as McpServer, ctx.pool);

    const handler = mockServer.getToolHandler('disconnect')!;
    const result = await handler({ serverId: 'test-server' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('disconnected');
    expect(ctx.pool.has('test-server')).toBe(false);
  });

  it('returns error for non-existent connection', async () => {
    const { registerDisconnectTool } = await import('../../../src/tools/disconnect.js');

    const mockServer = createMockServer();
    registerDisconnectTool(mockServer as unknown as McpServer, ctx.pool);

    const handler = mockServer.getToolHandler('disconnect')!;
    const result = await handler({ serverId: 'unknown-server' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active connection');
  });
});
