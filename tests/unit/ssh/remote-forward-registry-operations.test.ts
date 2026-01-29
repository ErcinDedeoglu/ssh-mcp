import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Client, ClientChannel } from 'ssh2';
import {
  RemoteForwardRegistry,
  type ActiveRemoteForward,
} from '../../../src/ssh/remote-forward-registry.js';

function createMockClient(): Client {
  return {} as unknown as Client;
}

function createMockChannel(): ClientChannel {
  return { close: vi.fn() } as unknown as ClientChannel;
}

function createRemoteForward(overrides: Partial<ActiveRemoteForward> = {}): ActiveRemoteForward {
  return {
    serverId: 'server-1',
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

describe('RemoteForwardRegistry - list operations', () => {
  let registry: RemoteForwardRegistry;

  beforeEach(() => {
    registry = new RemoteForwardRegistry();
  });

  describe('listByServer', () => {
    it('returns empty array when no forwards', () => {
      expect(registry.listByServer('server-1')).toEqual([]);
    });

    it('returns forwards for specified server', () => {
      const forward1 = createRemoteForward({
        serverId: 'server-1',
        remotePort: 8080,
        boundPort: 8080,
      });
      const forward2 = createRemoteForward({
        serverId: 'server-1',
        remotePort: 9000,
        boundPort: 9000,
      });
      const forward3 = createRemoteForward({
        serverId: 'server-2',
        remotePort: 8080,
        boundPort: 8080,
      });
      registry.add(forward1);
      registry.add(forward2);
      registry.add(forward3);
      const list = registry.listByServer('server-1');
      expect(list).toHaveLength(2);
      expect(list).toContain(forward1);
      expect(list).toContain(forward2);
      expect(list).not.toContain(forward3);
    });
  });

  describe('listAll', () => {
    it('returns empty array when no forwards', () => {
      expect(registry.listAll()).toEqual([]);
    });

    it('returns all forwards', () => {
      const forward1 = createRemoteForward({
        serverId: 'server-1',
        remotePort: 8080,
        boundPort: 8080,
      });
      const forward2 = createRemoteForward({
        serverId: 'server-2',
        remotePort: 9000,
        boundPort: 9000,
      });
      registry.add(forward1);
      registry.add(forward2);
      const list = registry.listAll();
      expect(list).toHaveLength(2);
      expect(list).toContain(forward1);
      expect(list).toContain(forward2);
    });
  });

  describe('removeByServer', () => {
    it('removes all forwards for server and returns count', () => {
      registry.add(
        createRemoteForward({ serverId: 'server-1', remotePort: 8080, boundPort: 8080 }),
      );
      registry.add(
        createRemoteForward({ serverId: 'server-1', remotePort: 9000, boundPort: 9000 }),
      );
      registry.add(
        createRemoteForward({ serverId: 'server-2', remotePort: 8080, boundPort: 8080 }),
      );
      const removed = registry.removeByServer('server-1');
      expect(removed).toBe(2);
      expect(registry.size).toBe(1);
      expect(registry.has('server-2', '127.0.0.1', 8080)).toBe(true);
    });

    it('returns 0 when no forwards for server', () => {
      registry.add(createRemoteForward({ serverId: 'server-2' }));
      const removed = registry.removeByServer('server-1');
      expect(removed).toBe(0);
      expect(registry.size).toBe(1);
    });

    it('closes all channels for removed forwards', () => {
      const channel1 = createMockChannel();
      const channel2 = createMockChannel();
      registry.add(
        createRemoteForward({ serverId: 'server-1', activeChannels: new Set([channel1]) }),
      );
      registry.add(
        createRemoteForward({ serverId: 'server-2', activeChannels: new Set([channel2]) }),
      );
      registry.removeByServer('server-1');
      expect(channel1.close).toHaveBeenCalled();
      expect(channel2.close).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('removes all forwards', () => {
      registry.add(
        createRemoteForward({ serverId: 'server-1', remotePort: 8080, boundPort: 8080 }),
      );
      registry.add(
        createRemoteForward({ serverId: 'server-2', remotePort: 9000, boundPort: 9000 }),
      );
      registry.clear();
      expect(registry.size).toBe(0);
    });

    it('closes all channels', () => {
      const channel1 = createMockChannel();
      const channel2 = createMockChannel();
      registry.add(
        createRemoteForward({
          activeChannels: new Set([channel1]),
          remotePort: 8080,
          boundPort: 8080,
        }),
      );
      registry.add(
        createRemoteForward({
          activeChannels: new Set([channel2]),
          remotePort: 9000,
          boundPort: 9000,
        }),
      );
      registry.clear();
      expect(channel1.close).toHaveBeenCalled();
      expect(channel2.close).toHaveBeenCalled();
    });
  });

  describe('size', () => {
    it('returns 0 for empty registry', () => {
      expect(registry.size).toBe(0);
    });

    it('returns correct count', () => {
      registry.add(createRemoteForward({ remotePort: 8080, boundPort: 8080 }));
      registry.add(createRemoteForward({ remotePort: 9000, boundPort: 9000 }));
      expect(registry.size).toBe(2);
    });
  });
});
