import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AddressInfo } from 'node:net';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';

const mockInstances: EventEmitter[] = [];
const mockNetServers: EventEmitter[] = [];

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

describe('forward_port - options and registry', () => {
  let ctx: TestContext;
  let forwardRegistry: ForwardRegistry;

  beforeEach(() => {
    clearInstances(mockInstances);
    mockNetServers.length = 0;
    ctx = createTestContext();
    forwardRegistry = new ForwardRegistry();
  });

  it('uses specified local host and port', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as unknown as McpServer, ctx.pool, forwardRegistry);

    const handler = mockServer.getToolHandler('forward_port')!;
    const result = await handler({
      serverId: 'test-server',
      remoteHost: 'db.internal',
      remotePort: 5432,
      localHost: '0.0.0.0',
      localPort: 15432,
    });

    expect(result.isError).toBeUndefined();
  });

  it('registers forward in registry', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as unknown as McpServer, ctx.pool, forwardRegistry);

    const handler = mockServer.getToolHandler('forward_port')!;
    await handler({ serverId: 'test-server', remoteHost: 'db.internal', remotePort: 5432 });

    expect(forwardRegistry.has('127.0.0.1', 54321)).toBe(true);
    const forward = forwardRegistry.get('127.0.0.1', 54321);
    expect(forward?.serverId).toBe('test-server');
    expect(forward?.remoteHost).toBe('db.internal');
    expect(forward?.remotePort).toBe(5432);
  });

  it('updates session activity timestamp', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const lastActivityBefore = session.lastActivity;
    await new Promise((resolve) => setTimeout(resolve, 10));

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as unknown as McpServer, ctx.pool, forwardRegistry);

    const handler = mockServer.getToolHandler('forward_port')!;
    await handler({ serverId: 'test-server', remoteHost: 'db.internal', remotePort: 5432 });

    expect(session.lastActivity).toBeGreaterThan(lastActivityBefore);
  });

  it('sanitizes errors', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const { homedir } = await import('node:os');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as unknown as McpServer, ctx.pool, forwardRegistry);

    const handler = mockServer.getToolHandler('forward_port')!;
    const homeDir = homedir();

    const resultPromise = handler({
      serverId: 'test-server',
      remoteHost: 'db.internal',
      remotePort: 5432,
    });

    const mockNetServer = mockNetServers[mockNetServers.length - 1] as EventEmitter;
    mockNetServer.emit('error', new Error(`EADDRINUSE ${homeDir}/socket`));

    const result = await resultPromise;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain(homeDir);
    expect(result.content[0].text).toContain('~');
  });
});
