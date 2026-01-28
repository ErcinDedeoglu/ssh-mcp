import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerConfig, PasswordAuth, PrivateKeyAuth } from '../../src/config/types.js';

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

vi.mock('ssh2', () => ({
  Client: MockClient,
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600 })),
}));

import { SSHConnection } from '../../src/ssh/connection.js';
import { SessionKeeper } from '../../src/ssh/session.js';
import { ConnectionPool } from '../../src/ssh/pool.js';

function clearMockInstances(): void {
  mockInstances.length = 0;
}

function getMockClient(index = 0): EventEmitter & { connect: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  return mockInstances[index] as EventEmitter & { connect: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
}

describe('SSHConnection', () => {
  let serverConfigPassword: ServerConfig;
  let serverConfigKey: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances();

    serverConfigPassword = {
      id: 'test-server-password',
      host: '192.168.1.100',
      port: 22,
      username: 'ubuntu',
      auth: { password: 'secret123' } as PasswordAuth,
    };

    serverConfigKey = {
      id: 'test-server-key',
      host: '192.168.1.200',
      port: 2222,
      username: 'deploy',
      auth: { privateKey: '/home/user/.ssh/id_rsa', passphrase: 'keypass' } as PrivateKeyAuth,
    };
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
        })
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
        })
      );
    });

    it('throws on authentication failure', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();

      const connectPromise = connection.connect();
      process.nextTick(() => {
        mockClient.emit('error', new Error('Authentication failed'));
      });

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
        expect.objectContaining({
          readyTimeout: 10000,
        })
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
        expect.objectContaining({
          readyTimeout: 30000,
        })
      );
    });
  });

  describe('Events', () => {
    it('emits connected event on successful connection', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectedHandler = vi.fn();
      connection.on('connected', connectedHandler);

      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      expect(connectedHandler).toHaveBeenCalledWith(serverConfigPassword.id);
    });

    it('emits disconnected event on connection close', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const disconnectedHandler = vi.fn();
      connection.on('disconnected', disconnectedHandler);

      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      mockClient.emit('close');

      expect(disconnectedHandler).toHaveBeenCalledWith(serverConfigPassword.id);
    });

    it('emits error event on connection error', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const errorHandler = vi.fn();
      connection.on('error', errorHandler);

      const connectPromise = connection.connect();
      const testError = new Error('Network error');
      setImmediate(() => mockClient.emit('error', testError));

      await expect(connectPromise).rejects.toThrow();
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('handles connection error events after connected', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const errorHandler = vi.fn();
      connection.on('error', errorHandler);

      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      const lateError = new Error('Connection lost');
      mockClient.emit('error', lateError);

      expect(errorHandler).toHaveBeenCalledWith(lateError);
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

describe('ConnectionPool', () => {
  let pool: ConnectionPool;
  let serverConfig1: ServerConfig;
  let serverConfig2: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances();
    pool = new ConnectionPool();

    serverConfig1 = {
      id: 'server-1',
      host: '10.0.0.1',
      port: 22,
      username: 'user1',
      auth: { password: 'pass1' } as PasswordAuth,
    };

    serverConfig2 = {
      id: 'server-2',
      host: '10.0.0.2',
      port: 22,
      username: 'user2',
      auth: { password: 'pass2' } as PasswordAuth,
    };
  });

  afterEach(() => {
    pool.clear();
    vi.restoreAllMocks();
  });

  describe('Add and Get', () => {
    it('stores connection in pool', async () => {
      const connection = new SessionKeeper(serverConfig1);
      const mockClient = getMockClient();

      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      pool.add(connection);

      expect(pool.has('server-1')).toBe(true);
    });

    it('retrieves existing connection from pool', async () => {
      const connection = new SessionKeeper(serverConfig1);
      const mockClient = getMockClient();

      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      pool.add(connection);

      const retrieved = pool.get('server-1');
      expect(retrieved).toBe(connection);
    });

    it('returns undefined for non-existent connection', () => {
      const retrieved = pool.get('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('stores multiple connections', async () => {
      const conn1 = new SessionKeeper(serverConfig1);
      const conn2 = new SessionKeeper(serverConfig2);
      const mock1 = getMockClient(0);
      const mock2 = getMockClient(1);

      const p1 = conn1.connect();
      setImmediate(() => mock1.emit('ready'));
      await p1;

      const p2 = conn2.connect();
      setImmediate(() => mock2.emit('ready'));
      await p2;

      pool.add(conn1);
      pool.add(conn2);

      expect(pool.size).toBe(2);
      expect(pool.get('server-1')).toBe(conn1);
      expect(pool.get('server-2')).toBe(conn2);
    });
  });

  describe('Remove', () => {
    it('removes connection from pool', async () => {
      const connection = new SessionKeeper(serverConfig1);
      const mockClient = getMockClient();

      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      pool.add(connection);
      expect(pool.has('server-1')).toBe(true);

      pool.remove('server-1');
      expect(pool.has('server-1')).toBe(false);
    });

    it('disconnects connection when removing', async () => {
      const connection = new SessionKeeper(serverConfig1);
      const mockClient = getMockClient();

      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      pool.add(connection);
      pool.remove('server-1');

      expect(mockClient.end).toHaveBeenCalled();
    });

    it('handles removing non-existent connection gracefully', () => {
      expect(() => pool.remove('non-existent')).not.toThrow();
    });
  });

  describe('Clear', () => {
    it('removes all connections from pool', async () => {
      const conn1 = new SessionKeeper(serverConfig1);
      const conn2 = new SessionKeeper(serverConfig2);
      const mock1 = getMockClient(0);
      const mock2 = getMockClient(1);

      const p1 = conn1.connect();
      setImmediate(() => mock1.emit('ready'));
      await p1;

      const p2 = conn2.connect();
      setImmediate(() => mock2.emit('ready'));
      await p2;

      pool.add(conn1);
      pool.add(conn2);
      expect(pool.size).toBe(2);

      pool.clear();
      expect(pool.size).toBe(0);
    });

    it('disconnects all connections when clearing', async () => {
      const conn1 = new SessionKeeper(serverConfig1);
      const conn2 = new SessionKeeper(serverConfig2);
      const mock1 = getMockClient(0);
      const mock2 = getMockClient(1);

      const p1 = conn1.connect();
      setImmediate(() => mock1.emit('ready'));
      await p1;

      const p2 = conn2.connect();
      setImmediate(() => mock2.emit('ready'));
      await p2;

      pool.add(conn1);
      pool.add(conn2);

      pool.clear();

      expect(mock1.end).toHaveBeenCalled();
      expect(mock2.end).toHaveBeenCalled();
    });
  });

  describe('Auto-remove on disconnect', () => {
    it('keeps connection in pool during reconnection attempts', async () => {
      const session = new SessionKeeper(serverConfig1);
      const mockClient = getMockClient();

      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      pool.add(session);
      expect(pool.has('server-1')).toBe(true);

      mockClient.emit('close');

      expect(pool.has('server-1')).toBe(true);
    });

    it('removes connection from pool when max retries reached', async () => {
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      const session = new SessionKeeper(serverConfig1, { maxReconnectAttempts: 0 });
      const mockClient = getMockClient();

      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      pool.add(session);
      expect(pool.has('server-1')).toBe(true);

      mockClient.emit('close');

      expect(pool.has('server-1')).toBe(false);
    });
  });
});
