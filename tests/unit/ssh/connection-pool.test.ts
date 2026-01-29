/**
 * ConnectionPool tests: add, get, remove, clear, and auto-remove on disconnect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerConfig } from '../../../src/config/types.js';
import { createPoolServerConfig } from './_fixtures/server-configs.fixture.js';

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

import { SessionKeeper } from '../../../src/ssh/session.js';
import { ConnectionPool } from '../../../src/ssh/pool.js';

type MockClientType = EventEmitter & {
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function clearMockInstances(): void {
  mockInstances.length = 0;
}
function getMockClient(index = 0): MockClientType {
  return mockInstances[index] as MockClientType;
}

async function connectSession(session: SessionKeeper, clientIndex = 0): Promise<MockClientType> {
  const mockClient = getMockClient(clientIndex);
  const connectPromise = session.connect();
  setImmediate(() => mockClient.emit('ready'));
  await connectPromise;
  return mockClient;
}

describe('ConnectionPool', () => {
  let pool: ConnectionPool;
  let serverConfig1: ServerConfig;
  let serverConfig2: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances();
    pool = new ConnectionPool();
    serverConfig1 = createPoolServerConfig('server-1', '10.0.0.1');
    serverConfig2 = createPoolServerConfig('server-2', '10.0.0.2');
  });

  afterEach(() => {
    pool.clear();
    vi.restoreAllMocks();
  });

  describe('Add and Get', () => {
    it('stores connection in pool', async () => {
      const connection = new SessionKeeper(serverConfig1);
      await connectSession(connection);
      pool.add(connection);
      expect(pool.has('server-1')).toBe(true);
    });

    it('retrieves existing connection from pool', async () => {
      const connection = new SessionKeeper(serverConfig1);
      await connectSession(connection);
      pool.add(connection);
      expect(pool.get('server-1')).toBe(connection);
    });

    it('returns undefined for non-existent connection', () => {
      expect(pool.get('non-existent')).toBeUndefined();
    });

    it('stores multiple connections', async () => {
      const conn1 = new SessionKeeper(serverConfig1);
      const conn2 = new SessionKeeper(serverConfig2);
      await connectSession(conn1, 0);
      await connectSession(conn2, 1);
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
      await connectSession(connection);
      pool.add(connection);
      expect(pool.has('server-1')).toBe(true);
      pool.remove('server-1');
      expect(pool.has('server-1')).toBe(false);
    });

    it('disconnects connection when removing', async () => {
      const connection = new SessionKeeper(serverConfig1);
      const mockClient = await connectSession(connection);
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
      await connectSession(conn1, 0);
      await connectSession(conn2, 1);
      pool.add(conn1);
      pool.add(conn2);
      expect(pool.size).toBe(2);
      pool.clear();
      expect(pool.size).toBe(0);
    });

    it('disconnects all connections when clearing', async () => {
      const conn1 = new SessionKeeper(serverConfig1);
      const conn2 = new SessionKeeper(serverConfig2);
      const mock1 = await connectSession(conn1, 0);
      const mock2 = await connectSession(conn2, 1);
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
      const mockClient = await connectSession(session);
      pool.add(session);
      expect(pool.has('server-1')).toBe(true);
      mockClient.emit('close');
      expect(pool.has('server-1')).toBe(true);
    });

    it('removes connection from pool when max retries reached', async () => {
      const { SessionKeeper } = await import('../../../src/ssh/session.js');
      const session = new SessionKeeper(serverConfig1, { maxReconnectAttempts: 0 });
      const mockClient = await connectSession(session);
      pool.add(session);
      expect(pool.has('server-1')).toBe(true);
      mockClient.emit('close');
      expect(pool.has('server-1')).toBe(false);
    });
  });
});
