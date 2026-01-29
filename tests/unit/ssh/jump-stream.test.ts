import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ClientChannel } from 'ssh2';

const mockInstances: EventEmitter[] = [];

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');

  class MockClient extends EE {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    sftp = vi.fn();
    forwardOut = vi.fn();
    forwardIn = vi.fn();
    unforwardIn = vi.fn();
    constructor() {
      super();
      mockInstances.push(this);
    }
  }

  return { MockClient };
});

vi.mock('ssh2', () => ({ Client: MockClient }));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600, size: 1024 })),
}));

function getMockClient(): EventEmitter & {
  forwardOut: ReturnType<typeof vi.fn>;
} {
  return mockInstances[mockInstances.length - 1] as EventEmitter & {
    forwardOut: ReturnType<typeof vi.fn>;
  };
}

function createMockChannel(): ClientChannel {
  const channel = new EventEmitter() as ClientChannel & EventEmitter;
  return channel;
}

describe('createJumpStream', () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  it('creates a stream through connected jump session', async () => {
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const { createJumpStream } = await import('../../../src/ssh/jump-stream.js');

    const serverConfig = {
      id: 'jump-host',
      host: '192.168.1.1',
      port: 22,
      username: 'admin',
      auth: { password: 'secret' },
    };

    const session = new SessionKeeper(serverConfig);
    const mockClient = getMockClient();
    const mockChannel = createMockChannel();

    mockClient.forwardOut.mockImplementation((_srcHost, _srcPort, _dstHost, _dstPort, callback) => {
      setImmediate(() => callback(null, mockChannel));
    });

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    const stream = await createJumpStream(session, '10.0.0.5', 22);
    expect(stream).toBe(mockChannel);
    expect(mockClient.forwardOut).toHaveBeenCalledWith(
      '127.0.0.1',
      0,
      '10.0.0.5',
      22,
      expect.any(Function),
    );
  });

  it('rejects if jump session is not connected', async () => {
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const { createJumpStream } = await import('../../../src/ssh/jump-stream.js');

    const serverConfig = {
      id: 'jump-host',
      host: '192.168.1.1',
      port: 22,
      username: 'admin',
      auth: { password: 'secret' },
    };

    const session = new SessionKeeper(serverConfig);

    await expect(createJumpStream(session, '10.0.0.5', 22)).rejects.toThrow(
      "Jump host 'jump-host' is not connected",
    );
  });

  it('rejects if forwardOut fails', async () => {
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const { createJumpStream } = await import('../../../src/ssh/jump-stream.js');

    const serverConfig = {
      id: 'jump-host',
      host: '192.168.1.1',
      port: 22,
      username: 'admin',
      auth: { password: 'secret' },
    };

    const session = new SessionKeeper(serverConfig);
    const mockClient = getMockClient();

    mockClient.forwardOut.mockImplementation((_srcHost, _srcPort, _dstHost, _dstPort, callback) => {
      setImmediate(() => callback(new Error('Connection refused')));
    });

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    await expect(createJumpStream(session, '10.0.0.5', 22)).rejects.toThrow(
      "Failed to create tunnel through 'jump-host': Connection refused",
    );
  });

  it('uses custom source host and port when provided', async () => {
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const { createJumpStream } = await import('../../../src/ssh/jump-stream.js');

    const serverConfig = {
      id: 'jump-host',
      host: '192.168.1.1',
      port: 22,
      username: 'admin',
      auth: { password: 'secret' },
    };

    const session = new SessionKeeper(serverConfig);
    const mockClient = getMockClient();
    const mockChannel = createMockChannel();

    mockClient.forwardOut.mockImplementation((_srcHost, _srcPort, _dstHost, _dstPort, callback) => {
      setImmediate(() => callback(null, mockChannel));
    });

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    await createJumpStream(session, '10.0.0.5', 22, { srcHost: '10.0.0.1', srcPort: 12345 });

    expect(mockClient.forwardOut).toHaveBeenCalledWith(
      '10.0.0.1',
      12345,
      '10.0.0.5',
      22,
      expect.any(Function),
    );
  });
});
