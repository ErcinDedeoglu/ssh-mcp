import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Client, ClientChannel } from 'ssh2';
import type { Server as NetServer, Socket, AddressInfo } from 'node:net';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';

type MockNetServer = NetServer & {
  connectionHandler?: (socket: Socket) => void;
  mockAddress: AddressInfo;
};

type ForwardOutCallback = (err: Error | undefined, stream: ClientChannel) => void;

const mockServers: MockNetServer[] = [];

const { mockCreateServer } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');

  function mockCreateServer(connectionHandler: (socket: Socket) => void): MockNetServer {
    const server = new EE() as MockNetServer;
    server.connectionHandler = connectionHandler;
    server.mockAddress = { address: '127.0.0.1', port: 54321, family: 'IPv4' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.listen = vi.fn((...args: any[]) => {
      const callback = args[args.length - 1] as () => void;
      setImmediate(() => callback());
      return server;
    }) as unknown as MockNetServer['listen'];
    server.address = vi.fn(() => server.mockAddress);
    server.close = vi.fn();
    mockServers.push(server);
    return server;
  }
  return { mockCreateServer };
});

vi.mock('node:net', () => ({ createServer: mockCreateServer }));

import { createLocalForward, type LocalForwardConfig } from '../../../src/ssh/local-forward.js';

function createMockClient(): Client & { forwardOut: ReturnType<typeof vi.fn> } {
  return { forwardOut: vi.fn() } as unknown as Client & { forwardOut: ReturnType<typeof vi.fn> };
}

function createMockSocket(): Socket & EventEmitter {
  const socket = new EventEmitter() as Socket & EventEmitter;
  (socket as unknown as { pipe: ReturnType<typeof vi.fn> }).pipe = vi.fn().mockReturnValue(socket);
  (socket as unknown as { destroy: ReturnType<typeof vi.fn> }).destroy = vi.fn();
  (socket as unknown as { end: ReturnType<typeof vi.fn> }).end = vi.fn();
  return socket;
}

describe('createLocalForward - basic', () => {
  let registry: ForwardRegistry;
  let mockClient: Client & { forwardOut: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockServers.length = 0;
    registry = new ForwardRegistry();
    mockClient = createMockClient();
  });

  describe('success path', () => {
    it('creates local server and registers forward', async () => {
      const config: LocalForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'db.internal',
        remotePort: 5432,
      };

      const result = await createLocalForward(config, registry);

      expect(result.localHost).toBe('127.0.0.1');
      expect(result.localPort).toBe(54321);
      expect(registry.has('127.0.0.1', 54321)).toBe(true);
    });

    it('stores correct forward metadata', async () => {
      const config: LocalForwardConfig = {
        client: mockClient,
        serverId: 'test-server',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'redis.internal',
        remotePort: 6379,
      };

      await createLocalForward(config, registry);

      const forward = registry.get('127.0.0.1', 54321);
      expect(forward).toBeDefined();
      expect(forward?.serverId).toBe('test-server');
      expect(forward?.remoteHost).toBe('redis.internal');
      expect(forward?.remotePort).toBe(6379);
      expect(forward?.createdAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('forwardOut errors', () => {
    it('destroys socket on forwardOut error', async () => {
      const config: LocalForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'db.internal',
        remotePort: 5432,
      };

      mockClient.forwardOut.mockImplementation(
        (_lh: string, _lp: number, _rh: string, _rp: number, cb: ForwardOutCallback) => {
          cb(new Error('connection refused'), undefined as unknown as ClientChannel);
        },
      );

      await createLocalForward(config, registry);

      const server = mockServers[0];
      const socket = createMockSocket();
      server.connectionHandler!(socket);

      expect(
        (socket as unknown as { destroy: ReturnType<typeof vi.fn> }).destroy,
      ).toHaveBeenCalled();
    });
  });

  describe('server errors', () => {
    it('rejects promise on server error', async () => {
      const config: LocalForwardConfig = {
        client: mockClient,
        serverId: 'server-1',
        localHost: '127.0.0.1',
        localPort: 15432,
        remoteHost: 'db.internal',
        remotePort: 5432,
      };

      const promise = createLocalForward(config, registry);
      const server = mockServers[mockServers.length - 1];
      server.emit('error', new Error('EADDRINUSE'));

      await expect(promise).rejects.toThrow('EADDRINUSE');
    });
  });
});
