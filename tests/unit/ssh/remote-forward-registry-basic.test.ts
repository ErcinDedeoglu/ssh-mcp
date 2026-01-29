import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Client, ClientChannel } from 'ssh2';
import {
  RemoteForwardRegistry,
  makeRemoteForwardKey,
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

describe('RemoteForwardRegistry - basic operations', () => {
  let registry: RemoteForwardRegistry;

  beforeEach(() => {
    registry = new RemoteForwardRegistry();
  });

  describe('makeRemoteForwardKey', () => {
    it('creates key from serverId, host and port', () => {
      expect(makeRemoteForwardKey('server-1', '127.0.0.1', 8080)).toBe('server-1:127.0.0.1:8080');
      expect(makeRemoteForwardKey('prod', '0.0.0.0', 3000)).toBe('prod:0.0.0.0:3000');
    });
  });

  describe('add/get/has', () => {
    it('stores and retrieves forward by serverId:remoteHost:remotePort', () => {
      const forward = createRemoteForward();
      registry.add(forward);
      expect(registry.has('server-1', '127.0.0.1', 8080)).toBe(true);
      expect(registry.get('server-1', '127.0.0.1', 8080)).toBe(forward);
    });

    it('returns undefined for non-existent forward', () => {
      expect(registry.get('server-1', '127.0.0.1', 8080)).toBeUndefined();
      expect(registry.has('server-1', '127.0.0.1', 8080)).toBe(false);
    });

    it('stores multiple forwards on different ports', () => {
      const forward1 = createRemoteForward({ remotePort: 8080, boundPort: 8080 });
      const forward2 = createRemoteForward({ remotePort: 9000, boundPort: 9000 });
      registry.add(forward1);
      registry.add(forward2);
      expect(registry.size).toBe(2);
      expect(registry.get('server-1', '127.0.0.1', 8080)).toBe(forward1);
      expect(registry.get('server-1', '127.0.0.1', 9000)).toBe(forward2);
    });

    it('stores forwards for different servers', () => {
      const forward1 = createRemoteForward({ serverId: 'server-1' });
      const forward2 = createRemoteForward({ serverId: 'server-2' });
      registry.add(forward1);
      registry.add(forward2);
      expect(registry.size).toBe(2);
      expect(registry.get('server-1', '127.0.0.1', 8080)).toBe(forward1);
      expect(registry.get('server-2', '127.0.0.1', 8080)).toBe(forward2);
    });

    it('overwrites forward on same key', () => {
      const forward1 = createRemoteForward({ localPort: 3000 });
      const forward2 = createRemoteForward({ localPort: 4000 });
      registry.add(forward1);
      registry.add(forward2);
      expect(registry.size).toBe(1);
      expect(registry.get('server-1', '127.0.0.1', 8080)?.localPort).toBe(4000);
    });
  });

  describe('remove', () => {
    it('removes forward and returns it', () => {
      const forward = createRemoteForward();
      registry.add(forward);
      const removed = registry.remove('server-1', '127.0.0.1', 8080);
      expect(removed).toBe(forward);
      expect(registry.has('server-1', '127.0.0.1', 8080)).toBe(false);
    });

    it('returns undefined for non-existent forward', () => {
      const removed = registry.remove('server-1', '127.0.0.1', 8080);
      expect(removed).toBeUndefined();
    });

    it('closes all active channels on remove', () => {
      const channel1 = createMockChannel();
      const channel2 = createMockChannel();
      const activeChannels = new Set([channel1, channel2]);
      const forward = createRemoteForward({ activeChannels });
      registry.add(forward);
      registry.remove('server-1', '127.0.0.1', 8080);
      expect(channel1.close).toHaveBeenCalled();
      expect(channel2.close).toHaveBeenCalled();
    });

    it('clears activeChannels set on remove', () => {
      const channel = createMockChannel();
      const activeChannels = new Set([channel]);
      const forward = createRemoteForward({ activeChannels });
      registry.add(forward);
      registry.remove('server-1', '127.0.0.1', 8080);
      expect(activeChannels.size).toBe(0);
    });
  });
});
