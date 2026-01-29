import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';

const mockInstances: EventEmitter[] = [];

type ExtendedMockClient = MockClientType & {
  forwardIn: ReturnType<typeof vi.fn>;
  unforwardIn: ReturnType<typeof vi.fn>;
};

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');

  class MockClient extends EE {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    sftp = vi.fn();
    forwardOut = vi.fn();
    forwardIn = vi.fn();
    unforwardIn = vi.fn();
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

describe('forward_remote_port - basic', () => {
  let ctx: TestContext;
  let remoteForwardRegistry: RemoteForwardRegistry;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    remoteForwardRegistry = new RemoteForwardRegistry();
  });

  it('creates remote port forward for connected server', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as ExtendedMockClient;
    mockClient.forwardIn.mockImplementation((_host, port, callback) => {
      setImmediate(() => callback(undefined, port || 8080));
    });
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as unknown as McpServer,
      ctx.pool,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_remote_port')!;
    const result = await handler({
      serverId: 'test-server',
      localHost: 'localhost',
      localPort: 3000,
      remoteHost: '127.0.0.1',
      remotePort: 8080,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('forwarding');
    expect(parsed.localHost).toBe('localhost');
    expect(parsed.localPort).toBe(3000);
    expect(parsed.remoteHost).toBe('127.0.0.1');
    expect(parsed.remotePort).toBe(8080);
  });

  it('returns error if server not connected', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as unknown as McpServer,
      ctx.pool,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_remote_port')!;
    const result = await handler({
      serverId: 'unknown-server',
      localHost: 'localhost',
      localPort: 3000,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active connection');
  });

  it('uses auto-assigned port when remotePort is 0', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as ExtendedMockClient;
    mockClient.forwardIn.mockImplementation((_host, _port, callback) => {
      setImmediate(() => callback(undefined, 54321));
    });
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as unknown as McpServer,
      ctx.pool,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_remote_port')!;
    const result = await handler({
      serverId: 'test-server',
      localHost: 'localhost',
      localPort: 3000,
      remotePort: 0,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.remotePort).toBe(54321);
  });

  it('uses default remote host when not specified', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as ExtendedMockClient;
    mockClient.forwardIn.mockImplementation((_host, port, callback) => {
      setImmediate(() => callback(undefined, port));
    });
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as unknown as McpServer,
      ctx.pool,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_remote_port')!;
    const result = await handler({
      serverId: 'test-server',
      localHost: 'localhost',
      localPort: 3000,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.remoteHost).toBe('127.0.0.1');
  });
});
