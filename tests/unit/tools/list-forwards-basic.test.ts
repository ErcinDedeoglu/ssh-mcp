import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Server as NetServer } from 'node:net';
import { createMockServer } from './_fixtures/mock-server.js';
import { ForwardRegistry, type ActiveForward } from '../../../src/ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';

function createMockNetServer(): NetServer {
  return { close: vi.fn() } as unknown as NetServer;
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

describe('list_forwards - basic', () => {
  let forwardRegistry: ForwardRegistry;
  let remoteForwardRegistry: RemoteForwardRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    forwardRegistry = new ForwardRegistry();
    remoteForwardRegistry = new RemoteForwardRegistry();
  });

  it('returns empty list when no forwards', async () => {
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    const mockServer = createMockServer();
    registerListForwardsTool(
      mockServer as unknown as McpServer,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('list_forwards')!;
    const result = await handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.forwards).toHaveLength(0);
  });

  it('returns all forwards when no serverId specified', async () => {
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    forwardRegistry.add(createForward({ serverId: 'server-1', localPort: 15432 }));
    forwardRegistry.add(createForward({ serverId: 'server-2', localPort: 13306 }));

    const mockServer = createMockServer();
    registerListForwardsTool(
      mockServer as unknown as McpServer,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('list_forwards')!;
    const result = await handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.forwards).toHaveLength(2);
  });

  it('filters by serverId when specified', async () => {
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    forwardRegistry.add(createForward({ serverId: 'server-1', localPort: 15432 }));
    forwardRegistry.add(createForward({ serverId: 'server-1', localPort: 13306 }));
    forwardRegistry.add(createForward({ serverId: 'server-2', localPort: 16379 }));

    const mockServer = createMockServer();
    registerListForwardsTool(
      mockServer as unknown as McpServer,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('list_forwards')!;
    const result = await handler({ serverId: 'server-1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.forwards.every((f: { serverId: string }) => f.serverId === 'server-1')).toBe(
      true,
    );
  });

  it('returns empty list for non-existent serverId', async () => {
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    forwardRegistry.add(createForward({ serverId: 'server-1' }));

    const mockServer = createMockServer();
    registerListForwardsTool(
      mockServer as unknown as McpServer,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('list_forwards')!;
    const result = await handler({ serverId: 'non-existent' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.forwards).toHaveLength(0);
  });
});
