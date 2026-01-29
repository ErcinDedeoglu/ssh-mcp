/**
 * SSHConnection tests: connection, authentication, timeout, and basic properties.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerConfig } from '../../../src/config/types.js';
import {
  createPasswordServerConfig,
  createKeyServerConfig,
} from './_fixtures/server-configs.fixture.js';

const mockInstances: EventEmitter[] = [];

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as typeof import('node:events');

  class MockClient extends EventEmitter {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();

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
  statSync: vi.fn(() => ({ mode: 0o100600 })),
}));

import { SSHConnection } from '../../../src/ssh/connection.js';

function clearMockInstances(): void {
  mockInstances.length = 0;
}

function getMockClient(index = 0): EventEmitter & {
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return mockInstances[index] as EventEmitter & {
    connect: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
}

describe('SSHConnection', () => {
  let serverConfigPassword: ServerConfig;
  let serverConfigKey: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances();
    serverConfigPassword = createPasswordServerConfig();
    serverConfigKey = createKeyServerConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Connection', () => {
    it('connects with password authentication', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await expect(connectPromise).resolves.toBeUndefined();
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '192.168.1.100',
          port: 22,
          username: 'ubuntu',
          password: 'secret123',
        }),
      );
    });

    it('connects with SSH key authentication', async () => {
      const connection = new SSHConnection(serverConfigKey);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await expect(connectPromise).resolves.toBeUndefined();
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '192.168.1.200',
          port: 2222,
          username: 'deploy',
          privateKey: 'fake-private-key-content',
          passphrase: 'keypass',
        }),
      );
    });

    it('throws on authentication failure', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      process.nextTick(() => mockClient.emit('error', new Error('Authentication failed')));
      await expect(connectPromise).rejects.toThrow('Authentication failed');
    });

    it('throws on connection timeout', async () => {
      vi.useFakeTimers();
      try {
        const configWithShortTimeout: ServerConfig = {
          ...serverConfigPassword,
          timeouts: { connection: 1 },
        };
        const connection = new SSHConnection(configWithShortTimeout);
        const connectPromise = connection.connect();
        vi.advanceTimersByTime(1500);
        await expect(connectPromise).rejects.toThrow(/timeout/i);
      } finally {
        vi.useRealTimers();
      }
    });

    it('uses default timeout of 10 seconds when not configured', () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      void connection.connect();
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({ readyTimeout: 10000 }),
      );
    });

    it('uses configured timeout', () => {
      const configWithTimeout: ServerConfig = {
        ...serverConfigPassword,
        timeouts: { connection: 30 },
      };
      const connection = new SSHConnection(configWithTimeout);
      const mockClient = getMockClient();
      void connection.connect();
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({ readyTimeout: 30000 }),
      );
    });
  });

  describe('Properties', () => {
    it('exposes server id', () => {
      const connection = new SSHConnection(serverConfigPassword);
      expect(connection.id).toBe('test-server-password');
    });

    it('reports connected status correctly', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      expect(connection.isConnected).toBe(false);
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      expect(connection.isConnected).toBe(true);
      mockClient.emit('close');
      expect(connection.isConnected).toBe(false);
    });

    it('exposes underlying ssh2 client', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      expect(connection.client).toBe(mockClient);
    });

    it('exposes username from config', () => {
      const connection = new SSHConnection(serverConfigPassword);
      expect(connection.username).toBe('ubuntu');
    });
  });

  describe('Disconnect', () => {
    it('closes the connection gracefully', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      connection.disconnect();
      expect(mockClient.end).toHaveBeenCalled();
    });
  });
});
