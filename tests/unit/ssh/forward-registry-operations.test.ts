import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Server as NetServer, Socket } from 'node:net';
import { ForwardRegistry, type ActiveForward } from '../../../src/ssh/forward-registry.js';

function createMockServer(): NetServer {
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
    server: createMockServer(),
    activeSockets: new Set(),
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ForwardRegistry - list and bulk operations', () => {
  let registry: ForwardRegistry;

  beforeEach(() => {
    registry = new ForwardRegistry();
  });

  describe('listByServer', () => {
    it('returns all forwards for a specific server', () => {
      const forward1 = createForward({ serverId: 'server-1', localPort: 15432 });
      const forward2 = createForward({ serverId: 'server-1', localPort: 13306 });
      const forward3 = createForward({ serverId: 'server-2', localPort: 16379 });
      registry.add(forward1);
      registry.add(forward2);
      registry.add(forward3);

      const server1Forwards = registry.listByServer('server-1');
      expect(server1Forwards).toHaveLength(2);
      expect(server1Forwards).toContain(forward1);
      expect(server1Forwards).toContain(forward2);
      expect(server1Forwards).not.toContain(forward3);
    });

    it('returns empty array for server with no forwards', () => {
      const forward = createForward({ serverId: 'server-1' });
      registry.add(forward);
      const result = registry.listByServer('server-2');
      expect(result).toHaveLength(0);
    });
  });

  describe('listAll', () => {
    it('returns all forwards', () => {
      const forward1 = createForward({ localPort: 15432 });
      const forward2 = createForward({ localPort: 13306 });
      registry.add(forward1);
      registry.add(forward2);
      const all = registry.listAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(forward1);
      expect(all).toContain(forward2);
    });

    it('returns empty array when no forwards', () => {
      expect(registry.listAll()).toHaveLength(0);
    });
  });

  describe('removeByServer', () => {
    it('removes all forwards for a server and returns count', () => {
      const mockServer1 = createMockServer();
      const mockServer2 = createMockServer();
      const mockServer3 = createMockServer();
      registry.add(createForward({ serverId: 'server-1', localPort: 15432, server: mockServer1 }));
      registry.add(createForward({ serverId: 'server-1', localPort: 13306, server: mockServer2 }));
      registry.add(createForward({ serverId: 'server-2', localPort: 16379, server: mockServer3 }));

      const removed = registry.removeByServer('server-1');
      expect(removed).toBe(2);
      expect(registry.size).toBe(1);
      expect(registry.has('127.0.0.1', 15432)).toBe(false);
      expect(registry.has('127.0.0.1', 13306)).toBe(false);
      expect(registry.has('127.0.0.1', 16379)).toBe(true);
    });

    it('closes all servers for removed forwards', () => {
      const mockServer1 = createMockServer();
      const mockServer2 = createMockServer();
      registry.add(createForward({ serverId: 'server-1', localPort: 15432, server: mockServer1 }));
      registry.add(createForward({ serverId: 'server-1', localPort: 13306, server: mockServer2 }));

      registry.removeByServer('server-1');
      expect(mockServer1.close).toHaveBeenCalled();
      expect(mockServer2.close).toHaveBeenCalled();
    });

    it('returns 0 for server with no forwards', () => {
      const removed = registry.removeByServer('non-existent');
      expect(removed).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all forwards', () => {
      registry.add(createForward({ localPort: 15432 }));
      registry.add(createForward({ localPort: 13306 }));
      registry.add(createForward({ localPort: 16379 }));
      expect(registry.size).toBe(3);
      registry.clear();
      expect(registry.size).toBe(0);
    });

    it('closes all servers on clear', () => {
      const mockServer1 = createMockServer();
      const mockServer2 = createMockServer();
      registry.add(createForward({ localPort: 15432, server: mockServer1 }));
      registry.add(createForward({ localPort: 13306, server: mockServer2 }));
      registry.clear();
      expect(mockServer1.close).toHaveBeenCalled();
      expect(mockServer2.close).toHaveBeenCalled();
    });

    it('destroys all sockets on clear', () => {
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();
      registry.add(createForward({ localPort: 15432, activeSockets: new Set([socket1]) }));
      registry.add(createForward({ localPort: 13306, activeSockets: new Set([socket2]) }));
      registry.clear();
      expect(socket1.destroy).toHaveBeenCalled();
      expect(socket2.destroy).toHaveBeenCalled();
    });
  });

  describe('size', () => {
    it('returns correct count', () => {
      expect(registry.size).toBe(0);
      registry.add(createForward({ localPort: 15432 }));
      expect(registry.size).toBe(1);
      registry.add(createForward({ localPort: 13306 }));
      expect(registry.size).toBe(2);
      registry.remove('127.0.0.1', 15432);
      expect(registry.size).toBe(1);
    });
  });
});
