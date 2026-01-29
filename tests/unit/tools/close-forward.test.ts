import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Server as NetServer, Socket } from 'node:net';
import { createMockServer } from './_fixtures/mock-server.js';
import { ForwardRegistry, type ActiveForward } from '../../../src/ssh/forward-registry.js';

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

describe('close_forward', () => {
  let forwardRegistry: ForwardRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    forwardRegistry = new ForwardRegistry();
  });

  it('closes existing forward and returns success', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const forward = createForward();
    forwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    const result = await handler({ localPort: 15432 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('closed');
    expect(parsed.serverId).toBe('server-1');
    expect(parsed.localPort).toBe(15432);
    expect(parsed.remoteHost).toBe('db.internal');
    expect(parsed.remotePort).toBe(5432);
  });

  it('returns error for non-existent forward', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    const result = await handler({ localPort: 99999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active forward');
    expect(result.content[0].text).toContain('127.0.0.1:99999');
  });

  it('uses default local host when not specified', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const forward = createForward({ localHost: '127.0.0.1', localPort: 13306 });
    forwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    const result = await handler({ localPort: 13306 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.localHost).toBe('127.0.0.1');
  });

  it('uses specified local host', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const forward = createForward({ localHost: '0.0.0.0', localPort: 15432 });
    forwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    const result = await handler({ localPort: 15432, localHost: '0.0.0.0' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.localHost).toBe('0.0.0.0');
  });

  it('removes forward from registry', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const forward = createForward();
    forwardRegistry.add(forward);
    expect(forwardRegistry.has('127.0.0.1', 15432)).toBe(true);

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    await handler({ localPort: 15432 });

    expect(forwardRegistry.has('127.0.0.1', 15432)).toBe(false);
  });

  it('closes the net server', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const mockNetServer = createMockNetServer();
    const forward = createForward({ server: mockNetServer });
    forwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    await handler({ localPort: 15432 });

    expect(mockNetServer.close).toHaveBeenCalled();
  });

  it('destroys active sockets', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const socket1 = createMockSocket();
    const socket2 = createMockSocket();
    const activeSockets = new Set([socket1, socket2]);
    const forward = createForward({ activeSockets });
    forwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    await handler({ localPort: 15432 });

    expect(socket1.destroy).toHaveBeenCalled();
    expect(socket2.destroy).toHaveBeenCalled();
  });

  it('returns active connections count', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const socket1 = createMockSocket();
    const socket2 = createMockSocket();
    const socket3 = createMockSocket();
    const activeSockets = new Set([socket1, socket2, socket3]);
    const forward = createForward({ activeSockets });
    forwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    const result = await handler({ localPort: 15432 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.activeConnections).toBe(3);
  });

  it('fails when localHost does not match', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');

    const forward = createForward({ localHost: '0.0.0.0', localPort: 15432 });
    forwardRegistry.add(forward);

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as unknown as McpServer, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    const result = await handler({ localPort: 15432, localHost: '127.0.0.1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active forward');
  });
});
