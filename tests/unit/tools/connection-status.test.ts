import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../../../src/config/types.js';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';

const mockInstances: EventEmitter[] = [];
let mockConfig: Config;

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');
  class MockClient extends EE {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn(
      (_cmd: string, cb: (err: Error | null, stream: InstanceType<typeof EE>) => void) => {
        const stream = new EE();
        cb(null, stream);
        setImmediate(() => stream.emit('close'));
      },
    );
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

describe('connection_status', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
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
    registerConnectionStatusTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'test-server' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.connected).toBe(true);
    expect(parsed.idle).toBe(false);
    expect(parsed.reconnecting).toBe(false);
    expect(parsed.lastActivityMs).toBeGreaterThan(0);
  });

  it('returns server_not_found for unknown server', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');

    const mockServer = createMockServer();
    registerConnectionStatusTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'unknown-server' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('server_not_found');
  });

  it('includes reconnect attempt when reconnecting', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig, { baseReconnectDelayMs: 10 });
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const reconnectingPromise = new Promise((resolve) => {
      session.once('reconnecting', resolve);
    });
    mockClient.emit('close');
    await reconnectingPromise;

    const mockServer = createMockServer();
    registerConnectionStatusTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
    );

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'test-server' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reconnecting).toBe(true);
    expect(parsed.reconnectAttempt).toBe(1);
  });
});
