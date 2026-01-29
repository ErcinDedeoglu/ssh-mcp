import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Client, ClientChannel } from 'ssh2';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import {
  RemoteForwardRegistry,
  type ActiveRemoteForward,
} from '../../../src/ssh/remote-forward-registry.js';

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

function createMockClient(): Client {
  return { unforwardIn: vi.fn((_, __, cb) => cb?.(null)) } as unknown as Client;
}

function createMockChannel(): ClientChannel {
  return { close: vi.fn() } as unknown as ClientChannel;
}

function createRemoteForward(overrides: Partial<ActiveRemoteForward> = {}): ActiveRemoteForward {
  return {
    serverId: 'test-server',
    client: createMockClient(),
    remoteHost: '127.0.0.1',
    remotePort: 8080,
    boundPort: 8080,
    localHost: 'localhost',
    localPort: 3000,
    activeChannels: new Set(),
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('close_remote_forward - channels', () => {
  let ctx: TestContext;
  let remoteForwardRegistry: RemoteForwardRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances.length = 0;
    ctx = createTestContext();
    remoteForwardRegistry = new RemoteForwardRegistry();
  });

  it('closes channels on forward close', async () => {
    const { registerCloseRemoteForwardTool } =
      await import('../../../src/tools/close-remote-forward.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = mockInstances[0] as EventEmitter & { unforwardIn: ReturnType<typeof vi.fn> };
    mockClient.unforwardIn = vi.fn((_, __, cb) => setImmediate(() => cb?.(null)));
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const channel1 = createMockChannel();
    const channel2 = createMockChannel();
    const forward = createRemoteForward({
      client: session.client,
      activeChannels: new Set([channel1, channel2]),
    });
    remoteForwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseRemoteForwardTool(
      mockServer as unknown as McpServer,
      ctx.pool,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('close_remote_forward')!;
    await handler({ serverId: 'test-server', remotePort: 8080 });

    expect(channel1.close).toHaveBeenCalled();
    expect(channel2.close).toHaveBeenCalled();
  });

  it('includes active connections count in response', async () => {
    const { registerCloseRemoteForwardTool } =
      await import('../../../src/tools/close-remote-forward.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = mockInstances[0] as EventEmitter & { unforwardIn: ReturnType<typeof vi.fn> };
    mockClient.unforwardIn = vi.fn((_, __, cb) => setImmediate(() => cb?.(null)));
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const forward = createRemoteForward({
      client: session.client,
      activeChannels: new Set([createMockChannel(), createMockChannel()]),
    });
    remoteForwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseRemoteForwardTool(
      mockServer as unknown as McpServer,
      ctx.pool,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('close_remote_forward')!;
    const result = await handler({ serverId: 'test-server', remotePort: 8080 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.activeConnections).toBe(2);
  });
});
