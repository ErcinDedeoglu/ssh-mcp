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

const { MockClient, mockCreateServer, setNextServerError } = vi.hoisted(() => {
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

  let nextServerError: Error | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mockCreateServer(connectionHandler: any): any {
    const server = new EE();
    (server as unknown as { connectionHandler: unknown }).connectionHandler = connectionHandler;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as unknown as { listen: any }).listen = vi.fn((...args: any[]) => {
      const callback = args[args.length - 1] as () => void;
      if (nextServerError) {
        const err = nextServerError;
        nextServerError = null;
        setImmediate(() => server.emit('error', err));
      } else {
        setImmediate(() => callback());
      }
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

  function setNextServerError(err: Error): void {
    nextServerError = err;
  }

  return { MockClient, mockCreateServer, setNextServerError };
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

describe('forward_port - options and registry', () => {
  let ctx: TestContext;
  let forwardRegistry: ForwardRegistry;

  beforeEach(() => {
    clearInstances(mockInstances);
    mockNetServers.length = 0;
    ctx = createTestContext();
    mockConfig = ctx.config;
    forwardRegistry = new ForwardRegistry();
  });

  async function setupConnectedSession() {
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);
    return session;
  }

  async function setupTool() {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const mockServer = createMockServer();
    registerForwardPortTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      forwardRegistry,
    );
    return mockServer.getToolHandler('forward_port')!;
  }

  it('uses specified local host and port', async () => {
    await setupConnectedSession();
    const handler = await setupTool();

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
    await setupConnectedSession();
    const handler = await setupTool();

    await handler({ serverId: 'test-server', remoteHost: 'db.internal', remotePort: 5432 });

    expect(forwardRegistry.has('127.0.0.1', 54321)).toBe(true);
    const forward = forwardRegistry.get('127.0.0.1', 54321);
    expect(forward?.serverId).toBe('test-server');
    expect(forward?.remoteHost).toBe('db.internal');
    expect(forward?.remotePort).toBe(5432);
  });

  it('updates session activity timestamp', async () => {
    const session = await setupConnectedSession();
    const lastActivityBefore = session.lastActivity;
    await new Promise((resolve) => setTimeout(resolve, 10));

    const handler = await setupTool();
    await handler({ serverId: 'test-server', remoteHost: 'db.internal', remotePort: 5432 });

    expect(session.lastActivity).toBeGreaterThan(lastActivityBefore);
  });

  it('sanitizes errors', async () => {
    const { homedir } = await import('node:os');
    await setupConnectedSession();
    const handler = await setupTool();
    const homeDir = homedir();

    setNextServerError(new Error(`EADDRINUSE ${homeDir}/socket`));

    const result = await handler({
      serverId: 'test-server',
      remoteHost: 'db.internal',
      remotePort: 5432,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain(homeDir);
    expect(result.content[0].text).toContain('~');
  });
});
