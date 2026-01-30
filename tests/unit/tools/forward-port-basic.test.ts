import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../../../src/config/types.js';
import type { AddressInfo } from 'node:net';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';

const mockInstances: EventEmitter[] = [];
const mockNetServers: EventEmitter[] = [];
let mockConfig: Config;

const { MockClient, mockCreateServer } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');

  class MockClient extends EE {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    sftp = vi.fn();
    forwardOut = vi.fn();
    constructor() {
      super();
      mockInstances.push(this);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mockCreateServer(connectionHandler: any): any {
    const server = new EE();
    (server as unknown as { connectionHandler: unknown }).connectionHandler = connectionHandler;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as unknown as { listen: any }).listen = vi.fn((...args: any[]) => {
      const callback = args[args.length - 1] as () => void;
      setImmediate(() => callback());
      return server;
    });
    (server as unknown as { address: () => AddressInfo }).address = () => ({
      address: '127.0.0.1',
      port: 54321,
      family: 'IPv4',
    });
    (server as unknown as { close: ReturnType<typeof vi.fn> }).close = vi.fn();
    mockNetServers.push(server);
    return server;
  }

  return { MockClient, mockCreateServer };
});

vi.mock('ssh2', () => ({ Client: MockClient }));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600, size: 1024 })),
}));
vi.mock('node:net', () => ({ createServer: mockCreateServer }));
vi.mock('../../../src/config/loader.js', () => ({
  loadConfig: () => JSON.parse(JSON.stringify(mockConfig)),
}));

describe('forward_port - basic', () => {
  let ctx: TestContext;
  let forwardRegistry: ForwardRegistry;

  beforeEach(() => {
    clearInstances(mockInstances);
    mockNetServers.length = 0;
    ctx = createTestContext();
    mockConfig = ctx.config;
    forwardRegistry = new ForwardRegistry();
  });

  it('creates port forward for connected server', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerForwardPortTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      forwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_port')!;
    const result = await handler({
      serverId: 'test-server',
      remoteHost: 'db.internal',
      remotePort: 5432,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('forwarding');
    expect(parsed.remoteHost).toBe('db.internal');
    expect(parsed.remotePort).toBe(5432);
    expect(parsed.localPort).toBe(54321);
  });

  it('returns server_not_found for unknown server', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');

    const mockServer = createMockServer();
    registerForwardPortTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      forwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_port')!;
    const result = await handler({
      serverId: 'unknown-server',
      remoteHost: 'db.internal',
      remotePort: 5432,
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('server_not_found');
  });

  it('returns connection_failed when auto-connect fails', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');

    const mockServer = createMockServer();
    registerForwardPortTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      forwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_port')!;
    const initialClientCount = mockInstances.length;

    const resultPromise = handler({
      serverId: 'test-server',
      remoteHost: 'db.internal',
      remotePort: 5432,
    });

    await new Promise((r) => setImmediate(r));
    const newClient = mockInstances[initialClientCount] as MockClientType;
    newClient.emit('error', new Error('Connection refused'));

    const result = await resultPromise;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('connection_failed');
  });

  it('uses default local host and port when not specified', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerForwardPortTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      forwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_port')!;
    const result = await handler({
      serverId: 'test-server',
      remoteHost: 'redis.internal',
      remotePort: 6379,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.localHost).toBe('127.0.0.1');
  });
});
