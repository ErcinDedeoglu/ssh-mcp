import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Server as NetServer, Socket } from 'node:net';
import { createMockServer } from './_fixtures/mock-server.js';
import { ForwardRegistry, type ActiveForward } from '../../../src/ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';

function createMockNetServer(): NetServer {
  return { close: vi.fn() } as unknown as NetServer;
}

function createMockSocket(): Socket {
  return { destroy: vi.fn() } as unknown as Socket;
}

function createForward(overrides: Partial<ActiveForward> = {}): ActiveForward {
  return {
    serverId: 'server-1',
    localHost: '127.0.0.1',
    localPort: 15432,
    remoteHost: 'db.internal',
    remotePort: 5432,
    server: createMockNetServer(),
    activeSockets: new Set(),
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('list_forwards - details', () => {
  let forwardRegistry: ForwardRegistry;
  let remoteForwardRegistry: RemoteForwardRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    forwardRegistry = new ForwardRegistry();
    remoteForwardRegistry = new RemoteForwardRegistry();
  });

  it('includes forward details in response', async () => {
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    const createdAt = Date.now();
    forwardRegistry.add(
      createForward({
        serverId: 'test-server',
        localHost: '127.0.0.1',
        localPort: 15432,
        remoteHost: 'db.internal',
        remotePort: 5432,
        createdAt,
      }),
    );

    const mockServer = createMockServer();
    registerListForwardsTool(
      mockServer as unknown as McpServer,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('list_forwards')!;
    const result = await handler({});

    const parsed = JSON.parse(result.content[0].text);
    const forward = parsed.forwards[0];
    expect(forward.serverId).toBe('test-server');
    expect(forward.localHost).toBe('127.0.0.1');
    expect(forward.localPort).toBe(15432);
    expect(forward.remoteHost).toBe('db.internal');
    expect(forward.remotePort).toBe(5432);
    expect(forward.connectionString).toBe('127.0.0.1:15432 -> db.internal:5432');
    expect(forward.createdAt).toBe(new Date(createdAt).toISOString());
  });

  it('includes active connections count', async () => {
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    const socket1 = createMockSocket();
    const socket2 = createMockSocket();
    const activeSockets = new Set([socket1, socket2]);
    forwardRegistry.add(createForward({ activeSockets }));

    const mockServer = createMockServer();
    registerListForwardsTool(
      mockServer as unknown as McpServer,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('list_forwards')!;
    const result = await handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.forwards[0].activeConnections).toBe(2);
  });

  it('returns multiple forwards for same server', async () => {
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    forwardRegistry.add(
      createForward({ serverId: 'server-1', localPort: 15432, remotePort: 5432 }),
    );
    forwardRegistry.add(
      createForward({ serverId: 'server-1', localPort: 13306, remotePort: 3306 }),
    );
    forwardRegistry.add(
      createForward({ serverId: 'server-1', localPort: 16379, remotePort: 6379 }),
    );

    const mockServer = createMockServer();
    registerListForwardsTool(
      mockServer as unknown as McpServer,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('list_forwards')!;
    const result = await handler({ serverId: 'server-1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(3);
    const ports = parsed.forwards.map((f: { localPort: number }) => f.localPort).sort();
    expect(ports).toEqual([13306, 15432, 16379]);
  });
});
