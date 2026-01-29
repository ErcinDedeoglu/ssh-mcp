import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Server as NetServer, Socket } from 'node:net';
import {
  ForwardRegistry,
  makeForwardKey,
  type ActiveForward,
} from '../../../src/ssh/forward-registry.js';

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

describe('ForwardRegistry - basic operations', () => {
  let registry: ForwardRegistry;

  beforeEach(() => {
    registry = new ForwardRegistry();
  });

  describe('makeForwardKey', () => {
    it('creates key from host and port', () => {
      expect(makeForwardKey('127.0.0.1', 15432)).toBe('127.0.0.1:15432');
      expect(makeForwardKey('0.0.0.0', 3306)).toBe('0.0.0.0:3306');
    });
  });

  describe('add/get/has', () => {
    it('stores and retrieves forward by localHost:localPort', () => {
      const forward = createForward();
      registry.add(forward);
      expect(registry.has('127.0.0.1', 15432)).toBe(true);
      expect(registry.get('127.0.0.1', 15432)).toBe(forward);
    });

    it('returns undefined for non-existent forward', () => {
      expect(registry.get('127.0.0.1', 15432)).toBeUndefined();
      expect(registry.has('127.0.0.1', 15432)).toBe(false);
    });

    it('stores multiple forwards on different ports', () => {
      const forward1 = createForward({ localPort: 15432 });
      const forward2 = createForward({ localPort: 13306, remotePort: 3306 });
      registry.add(forward1);
      registry.add(forward2);
      expect(registry.size).toBe(2);
      expect(registry.get('127.0.0.1', 15432)).toBe(forward1);
      expect(registry.get('127.0.0.1', 13306)).toBe(forward2);
    });

    it('stores forwards on different hosts', () => {
      const forward1 = createForward({ localHost: '127.0.0.1', localPort: 5432 });
      const forward2 = createForward({ localHost: '0.0.0.0', localPort: 5432 });
      registry.add(forward1);
      registry.add(forward2);
      expect(registry.size).toBe(2);
      expect(registry.get('127.0.0.1', 5432)).toBe(forward1);
      expect(registry.get('0.0.0.0', 5432)).toBe(forward2);
    });

    it('overwrites forward on same host:port', () => {
      const forward1 = createForward({ remoteHost: 'db1.internal' });
      const forward2 = createForward({ remoteHost: 'db2.internal' });
      registry.add(forward1);
      registry.add(forward2);
      expect(registry.size).toBe(1);
      expect(registry.get('127.0.0.1', 15432)?.remoteHost).toBe('db2.internal');
    });
  });

  describe('remove', () => {
    it('removes forward and returns true', () => {
      const forward = createForward();
      registry.add(forward);
      const removed = registry.remove('127.0.0.1', 15432);
      expect(removed).toBe(true);
      expect(registry.has('127.0.0.1', 15432)).toBe(false);
    });

    it('returns false for non-existent forward', () => {
      const removed = registry.remove('127.0.0.1', 15432);
      expect(removed).toBe(false);
    });

    it('closes server on remove', () => {
      const mockServer = createMockServer();
      const forward = createForward({ server: mockServer });
      registry.add(forward);
      registry.remove('127.0.0.1', 15432);
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('destroys all active sockets on remove', () => {
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();
      const socket3 = createMockSocket();
      const activeSockets = new Set([socket1, socket2, socket3]);
      const forward = createForward({ activeSockets });
      registry.add(forward);
      registry.remove('127.0.0.1', 15432);
      expect(socket1.destroy).toHaveBeenCalled();
      expect(socket2.destroy).toHaveBeenCalled();
      expect(socket3.destroy).toHaveBeenCalled();
    });

    it('clears activeSockets set on remove', () => {
      const socket = createMockSocket();
      const activeSockets = new Set([socket]);
      const forward = createForward({ activeSockets });
      registry.add(forward);
      registry.remove('127.0.0.1', 15432);
      expect(activeSockets.size).toBe(0);
    });
  });
});
