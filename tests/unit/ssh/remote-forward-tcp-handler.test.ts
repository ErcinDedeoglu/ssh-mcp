import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ClientChannel } from 'ssh2';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';
import { createRemoteForward, type RemoteForwardConfig } from '../../../src/ssh/remote-forward.js';
import {
  createMockClient,
  createMockChannel,
  mockSocketInstances,
  clearSocketInstances,
  type ForwardInCallback,
  type MockClientType,
} from './_fixtures/remote-forward-mocks.js';

vi.mock('node:net', () => ({
  connect: vi.fn((_port: number, _host: string, callback?: () => void) => {
    const socket = new EventEmitter() as EventEmitter & {
      pipe: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    socket.pipe = vi.fn().mockReturnValue(socket);
    socket.destroy = vi.fn();
    mockSocketInstances.push(socket);
    if (callback) setImmediate(callback);
    return socket;
  }),
}));

describe('createRemoteForward - tcp connection handler', () => {
  let registry: RemoteForwardRegistry;
  let mockClient: MockClientType;
  let capturedTcpHandler: (
    info: { destIP: string; destPort: number },
    accept: () => ClientChannel,
    reject: () => boolean,
  ) => void;

  beforeEach(() => {
    clearSocketInstances();
    registry = new RemoteForwardRegistry();
    mockClient = createMockClient();

    mockClient.on.mockImplementation((event: string, handler: typeof capturedTcpHandler) => {
      if (event === 'tcp connection') {
        capturedTcpHandler = handler;
      }
      return mockClient;
    });

    mockClient.forwardIn.mockImplementation((_rh: string, _rp: number, cb: ForwardInCallback) => {
      cb(undefined, 8080);
    });
  });

  function createConfig(): RemoteForwardConfig {
    return {
      client: mockClient,
      serverId: 'server-1',
      remoteHost: '0.0.0.0',
      remotePort: 8080,
      localHost: 'localhost',
      localPort: 3000,
    };
  }

  it('ignores tcp connection when forward not in registry', async () => {
    await createRemoteForward(createConfig(), registry);
    registry.remove('server-1', '0.0.0.0', 8080);

    const channel = createMockChannel();
    const accept = vi.fn().mockReturnValue(channel);

    capturedTcpHandler({ destIP: '0.0.0.0', destPort: 8080 }, accept, vi.fn());

    expect(accept).not.toHaveBeenCalled();
  });

  it('ignores tcp connection when remoteHost does not match', async () => {
    const config = { ...createConfig(), remoteHost: '127.0.0.1' };
    await createRemoteForward(config, registry);

    const channel = createMockChannel();
    const accept = vi.fn().mockReturnValue(channel);

    capturedTcpHandler({ destIP: '0.0.0.0', destPort: 8080 }, accept, vi.fn());

    expect(accept).not.toHaveBeenCalled();
  });

  it('ignores tcp connection when destPort does not match boundPort', async () => {
    await createRemoteForward(createConfig(), registry);

    const channel = createMockChannel();
    const accept = vi.fn().mockReturnValue(channel);

    capturedTcpHandler({ destIP: '0.0.0.0', destPort: 9999 }, accept, vi.fn());

    expect(accept).not.toHaveBeenCalled();
  });

  it('accepts connection and pipes data when forward matches', async () => {
    const net = await import('node:net');
    await createRemoteForward(createConfig(), registry);

    const channel = createMockChannel();
    const accept = vi.fn().mockReturnValue(channel);

    capturedTcpHandler({ destIP: '0.0.0.0', destPort: 8080 }, accept, vi.fn());

    expect(accept).toHaveBeenCalled();
    expect(net.connect).toHaveBeenCalledWith(3000, 'localhost', expect.any(Function));
    expect(mockSocketInstances.length).toBe(1);

    await new Promise((resolve) => setImmediate(resolve));

    const socket = mockSocketInstances[0] as EventEmitter & { pipe: ReturnType<typeof vi.fn> };
    expect(channel.pipe).toHaveBeenCalledWith(socket);
    expect(socket.pipe).toHaveBeenCalledWith(channel);
  });

  it('closes channel and removes from set on socket error', async () => {
    await createRemoteForward(createConfig(), registry);

    const channel = createMockChannel();
    const accept = vi.fn().mockReturnValue(channel);

    capturedTcpHandler({ destIP: '0.0.0.0', destPort: 8080 }, accept, vi.fn());

    await vi.waitFor(() => expect(mockSocketInstances.length).toBe(1));

    mockSocketInstances[0].emit('error', new Error('Connection refused'));

    expect(channel.close).toHaveBeenCalled();
  });

  it('destroys socket and removes from set on channel error', async () => {
    await createRemoteForward(createConfig(), registry);

    const channel = createMockChannel();
    const accept = vi.fn().mockReturnValue(channel);

    capturedTcpHandler({ destIP: '0.0.0.0', destPort: 8080 }, accept, vi.fn());

    await vi.waitFor(() => expect(mockSocketInstances.length).toBe(1));

    const socket = mockSocketInstances[0] as EventEmitter & { destroy: ReturnType<typeof vi.fn> };
    channel.emit('error', new Error('Channel error'));

    expect(socket.destroy).toHaveBeenCalled();
  });

  it('destroys socket on channel close', async () => {
    await createRemoteForward(createConfig(), registry);

    const channel = createMockChannel();
    const accept = vi.fn().mockReturnValue(channel);

    capturedTcpHandler({ destIP: '0.0.0.0', destPort: 8080 }, accept, vi.fn());

    await vi.waitFor(() => expect(mockSocketInstances.length).toBe(1));

    const socket = mockSocketInstances[0] as EventEmitter & { destroy: ReturnType<typeof vi.fn> };
    channel.emit('close');

    expect(socket.destroy).toHaveBeenCalled();
  });

  it('closes channel on socket close', async () => {
    await createRemoteForward(createConfig(), registry);

    const channel = createMockChannel();
    const accept = vi.fn().mockReturnValue(channel);

    capturedTcpHandler({ destIP: '0.0.0.0', destPort: 8080 }, accept, vi.fn());

    await vi.waitFor(() => expect(mockSocketInstances.length).toBe(1));

    mockSocketInstances[0].emit('close');

    expect(channel.close).toHaveBeenCalled();
  });
});
