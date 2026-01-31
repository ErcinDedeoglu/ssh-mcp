import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';
import { createRemoteForward, type RemoteForwardConfig } from '../../../src/ssh/remote-forward.js';
import {
  createMockClient,
  type ForwardInCallback,
  type MockClientType,
} from './_fixtures/remote-forward-mocks.js';

vi.mock('node:net', () => ({
  connect: vi.fn(),
}));

describe('createRemoteForward - error handling', () => {
  let registry: RemoteForwardRegistry;
  let mockClient: MockClientType;

  beforeEach(() => {
    registry = new RemoteForwardRegistry();
    mockClient = createMockClient();
  });

  describe('forwardIn error path', () => {
    it('rejects promise when forwardIn callback receives error', async () => {
      const config: RemoteForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        remoteHost: '0.0.0.0',
        remotePort: 8080,
        localHost: 'localhost',
        localPort: 3000,
      };

      mockClient.forwardIn.mockImplementation((_rh: string, _rp: number, cb: ForwardInCallback) => {
        cb(new Error('Port already in use'), 0);
      });

      await expect(createRemoteForward(config, registry)).rejects.toThrow('Port already in use');
    });

    it('removes tcp connection listener on forwardIn error', async () => {
      const config: RemoteForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        remoteHost: '0.0.0.0',
        remotePort: 8080,
        localHost: 'localhost',
        localPort: 3000,
      };

      mockClient.forwardIn.mockImplementation((_rh: string, _rp: number, cb: ForwardInCallback) => {
        cb(new Error('Permission denied'), 0);
      });

      await expect(createRemoteForward(config, registry)).rejects.toThrow('Permission denied');

      expect(mockClient.on).toHaveBeenCalledWith('tcp connection', expect.any(Function));
      expect(mockClient.off).toHaveBeenCalledWith('tcp connection', expect.any(Function));
    });

    it('does not add forward to registry on forwardIn error', async () => {
      const config: RemoteForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        remoteHost: '0.0.0.0',
        remotePort: 8080,
        localHost: 'localhost',
        localPort: 3000,
      };

      mockClient.forwardIn.mockImplementation((_rh: string, _rp: number, cb: ForwardInCallback) => {
        cb(new Error('Connection failed'), 0);
      });

      await expect(createRemoteForward(config, registry)).rejects.toThrow('Connection failed');

      expect(registry.has('server-1', '0.0.0.0', 8080)).toBe(false);
      expect(registry.size).toBe(0);
    });
  });

  describe('forwardIn success path', () => {
    it('resolves with bound port when forwardIn succeeds', async () => {
      const config: RemoteForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        remoteHost: '0.0.0.0',
        remotePort: 8080,
        localHost: 'localhost',
        localPort: 3000,
      };

      mockClient.forwardIn.mockImplementation((_rh: string, _rp: number, cb: ForwardInCallback) => {
        cb(undefined, 8080);
      });

      const result = await createRemoteForward(config, registry);

      expect(result.remoteHost).toBe('0.0.0.0');
      expect(result.remotePort).toBe(8080);
      expect(result.boundPort).toBe(8080);
    });

    it('adds forward to registry on success', async () => {
      const config: RemoteForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        remoteHost: '0.0.0.0',
        remotePort: 8080,
        localHost: 'localhost',
        localPort: 3000,
      };

      mockClient.forwardIn.mockImplementation((_rh: string, _rp: number, cb: ForwardInCallback) => {
        cb(undefined, 8080);
      });

      await createRemoteForward(config, registry);

      expect(registry.has('server-1', '0.0.0.0', 8080)).toBe(true);
      const forward = registry.get('server-1', '0.0.0.0', 8080);
      expect(forward?.serverId).toBe('server-1');
      expect(forward?.remoteHost).toBe('0.0.0.0');
      expect(forward?.boundPort).toBe(8080);
      expect(forward?.localHost).toBe('localhost');
      expect(forward?.localPort).toBe(3000);
    });

    it('handles auto-assigned port (remotePort=0)', async () => {
      const config: RemoteForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        remoteHost: '0.0.0.0',
        remotePort: 0,
        localHost: 'localhost',
        localPort: 3000,
      };

      mockClient.forwardIn.mockImplementation((_rh: string, _rp: number, cb: ForwardInCallback) => {
        cb(undefined, 54321);
      });

      const result = await createRemoteForward(config, registry);

      expect(result.remotePort).toBe(54321);
      expect(result.boundPort).toBe(54321);
      expect(registry.has('server-1', '0.0.0.0', 54321)).toBe(true);
    });
  });
});
