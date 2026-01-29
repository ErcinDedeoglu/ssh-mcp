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

function createMockStream(): ClientChannel & EventEmitter {
  const stream = new EventEmitter() as ClientChannel & EventEmitter;
  (stream as unknown as { pipe: ReturnType<typeof vi.fn> }).pipe = vi.fn().mockReturnValue(stream);
  (stream as unknown as { close: ReturnType<typeof vi.fn> }).close = vi.fn();
  return stream;
}

const baseConfig: Omit<LocalForwardConfig, 'client'> = {
  serverId: 'server-1',
  localHost: '127.0.0.1',
  localPort: 0,
  remoteHost: 'db.internal',
  remotePort: 5432,
};

describe('createLocalForward - stream events', () => {
  let registry: ForwardRegistry;
  let mockClient: Client & { forwardOut: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockServers.length = 0;
    registry = new ForwardRegistry();
    mockClient = createMockClient();
  });

  it('destroys socket on stream error', async () => {
    const mockStream = createMockStream();
    mockClient.forwardOut.mockImplementation(
      (_lh: string, _lp: number, _rh: string, _rp: number, cb: ForwardOutCallback) => {
        cb(undefined, mockStream);
      },
    );

    await createLocalForward({ ...baseConfig, client: mockClient }, registry);

    const server = mockServers[0];
    const socket = createMockSocket();
    server.connectionHandler!(socket);

    mockStream.emit('error', new Error('stream error'));

    expect((socket as unknown as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled();
  });

  it('ends socket on stream close', async () => {
    const mockStream = createMockStream();
    mockClient.forwardOut.mockImplementation(
      (_lh: string, _lp: number, _rh: string, _rp: number, cb: ForwardOutCallback) => {
        cb(undefined, mockStream);
      },
    );

    await createLocalForward({ ...baseConfig, client: mockClient }, registry);

    const server = mockServers[0];
    const socket = createMockSocket();
    server.connectionHandler!(socket);

    mockStream.emit('close');

    expect((socket as unknown as { end: ReturnType<typeof vi.fn> }).end).toHaveBeenCalled();
  });

  it('closes stream on socket close', async () => {
    const mockStream = createMockStream();
    mockClient.forwardOut.mockImplementation(
      (_lh: string, _lp: number, _rh: string, _rp: number, cb: ForwardOutCallback) => {
        cb(undefined, mockStream);
      },
    );

    await createLocalForward({ ...baseConfig, client: mockClient }, registry);

    const server = mockServers[0];
    const socket = createMockSocket();
    server.connectionHandler!(socket);

    socket.emit('close');

    expect((mockStream as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });
});
