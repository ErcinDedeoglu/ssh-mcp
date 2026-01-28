import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerConfig, PasswordAuth } from '../../src/config/types.js';

const mockInstances: EventEmitter[] = [];

vi.mock('ssh2', () => {
  const { EventEmitter } = require('node:events');
  
  return {
    Client: class MockClient extends EventEmitter {
      connect = vi.fn();
      end = vi.fn();
      destroy = vi.fn();
      
      constructor() {
        super();
        mockInstances.push(this);
      }
    },
  };
});

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600 })),
}));

import { SessionKeeper, type SessionKeeperOptions } from '../../src/ssh/session.js';

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

async function connectWithReadyEmit(session: SessionKeeper, clientIndex = 0): Promise<void> {
  const connectPromise = session.connect();
  setImmediate(() => getMockClient(clientIndex).emit('ready'));
  await connectPromise;
}

describe('SessionKeeper', () => {
  let serverConfig: ServerConfig;
  let defaultOptions: SessionKeeperOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances();
    vi.useRealTimers();

    serverConfig = {
      id: 'test-server',
      host: '192.168.1.100',
      port: 22,
      username: 'ubuntu',
      auth: { password: 'secret123' } as PasswordAuth,
    };

    defaultOptions = {
      keepaliveIntervalMs: 30000,
      keepaliveCountMax: 3,
      idleTimeoutMs: 15 * 60 * 1000,
      maxReconnectAttempts: 5,
      baseReconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Keep-alive configuration', () => {
    it('passes keepaliveInterval to ssh2 ConnectConfig', async () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);
      const mockClient = getMockClient();

      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          keepaliveInterval: 30000,
        })
      );
    });

    it('passes keepaliveCountMax to ssh2 ConnectConfig', async () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);
      const mockClient = getMockClient();

      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          keepaliveCountMax: 3,
        })
      );
    });

    it('uses default keep-alive values when not specified', async () => {
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();

      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          keepaliveInterval: 30000,
          keepaliveCountMax: 3,
        })
      );
    });
  });

  describe('Idle timeout tracking', () => {
    it('tracks last activity timestamp on connect', async () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);

      const beforeConnect = Date.now();
      await connectWithReadyEmit(session);
      const afterConnect = Date.now();

      expect(session.lastActivity).toBeGreaterThanOrEqual(beforeConnect);
      expect(session.lastActivity).toBeLessThanOrEqual(afterConnect);
    });

    it('updates last activity on touch()', async () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);
      await connectWithReadyEmit(session);

      const initialActivity = session.lastActivity;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      session.touch();
      
      expect(session.lastActivity).toBeGreaterThan(initialActivity);
    });

    it('marks connection as idle after timeout', async () => {
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        idleTimeoutMs: 50,
      });
      await connectWithReadyEmit(session);

      expect(session.isIdle).toBe(false);
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(session.isIdle).toBe(true);
    });

    it('resets idle status on touch()', async () => {
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        idleTimeoutMs: 50,
      });
      await connectWithReadyEmit(session);

      await new Promise(resolve => setTimeout(resolve, 60));
      expect(session.isIdle).toBe(true);
      
      session.touch();
      
      expect(session.isIdle).toBe(false);
    });
  });

  describe('Auto-reconnection', () => {
    it('reconnects after unexpected disconnect', async () => {
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        baseReconnectDelayMs: 10,
      });
      const reconnectedHandler = vi.fn();
      session.on('reconnected', reconnectedHandler);

      await connectWithReadyEmit(session, 0);
      const mockClient1 = getMockClient(0);
      
      mockClient1.emit('close');

      await new Promise(resolve => setTimeout(resolve, 30));
      const mockClient2 = getMockClient(1);
      mockClient2.emit('ready');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(reconnectedHandler).toHaveBeenCalled();
      expect(session.isConnected).toBe(true);
    });

    it('uses exponential backoff for reconnection delays', async () => {
      const reconnectingHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        baseReconnectDelayMs: 10,
        maxReconnectDelayMs: 1000,
      });
      session.on('reconnecting', reconnectingHandler);
      
      await connectWithReadyEmit(session, 0);
      getMockClient(0).emit('close');

      await new Promise(resolve => setTimeout(resolve, 15));
      expect(reconnectingHandler).toHaveBeenCalledWith(1, 10);

      getMockClient(1).emit('error', new Error('fail'));
      await new Promise(resolve => setTimeout(resolve, 25));
      expect(reconnectingHandler).toHaveBeenCalledWith(2, 20);

      getMockClient(2).emit('error', new Error('fail'));
      await new Promise(resolve => setTimeout(resolve, 45));
      expect(reconnectingHandler).toHaveBeenCalledWith(3, 40);
    });

    it('caps reconnection delay at maxReconnectDelayMs', async () => {
      const reconnectingHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        baseReconnectDelayMs: 50,
        maxReconnectDelayMs: 60,
        maxReconnectAttempts: 5,
      });
      session.on('reconnecting', reconnectingHandler);
      
      await connectWithReadyEmit(session, 0);
      getMockClient(0).emit('close');

      await new Promise(resolve => setTimeout(resolve, 60));
      expect(reconnectingHandler).toHaveBeenLastCalledWith(1, 50);

      getMockClient(1).emit('error', new Error('fail'));
      await new Promise(resolve => setTimeout(resolve, 70));
      expect(reconnectingHandler).toHaveBeenLastCalledWith(2, 60);
    });

    it('respects max reconnection attempts', async () => {
      const maxRetriesHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        maxReconnectAttempts: 3,
        baseReconnectDelayMs: 5,
        maxReconnectDelayMs: 50,
      });
      session.on('max-retries-reached', maxRetriesHandler);
      
      await connectWithReadyEmit(session, 0);
      getMockClient(0).emit('close');

      await new Promise(resolve => setTimeout(resolve, 10));
      getMockClient(1).emit('error', new Error('fail'));

      await new Promise(resolve => setTimeout(resolve, 15));
      getMockClient(2).emit('error', new Error('fail'));

      await new Promise(resolve => setTimeout(resolve, 25));
      getMockClient(3).emit('error', new Error('fail'));

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(maxRetriesHandler).toHaveBeenCalledWith(3);
    });

    it('does not reconnect after intentional disconnect', async () => {
      const reconnectingHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        baseReconnectDelayMs: 10,
      });
      session.on('reconnecting', reconnectingHandler);
      
      await connectWithReadyEmit(session);
      const mockClient = getMockClient();

      session.disconnect();
      mockClient.emit('close');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(reconnectingHandler).not.toHaveBeenCalled();
    });
  });

  describe('Events', () => {
    it('emits reconnecting event with attempt number and delay', async () => {
      const reconnectingHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        baseReconnectDelayMs: 10,
      });
      session.on('reconnecting', reconnectingHandler);
      
      await connectWithReadyEmit(session);
      getMockClient().emit('close');

      await new Promise(resolve => setTimeout(resolve, 15));

      expect(reconnectingHandler).toHaveBeenCalledWith(1, 10);
    });

    it('emits reconnected event on successful reconnection', async () => {
      const reconnectedHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        baseReconnectDelayMs: 10,
      });
      session.on('reconnected', reconnectedHandler);
      
      await connectWithReadyEmit(session, 0);
      getMockClient(0).emit('close');

      await new Promise(resolve => setTimeout(resolve, 15));
      getMockClient(1).emit('ready');

      await new Promise(resolve => setTimeout(resolve, 5));
      expect(reconnectedHandler).toHaveBeenCalledWith(1);
    });

    it('emits max-retries-reached event after exhausting attempts', async () => {
      const maxRetriesHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        maxReconnectAttempts: 2,
        baseReconnectDelayMs: 5,
      });
      session.on('max-retries-reached', maxRetriesHandler);
      
      await connectWithReadyEmit(session, 0);
      getMockClient(0).emit('close');

      await new Promise(resolve => setTimeout(resolve, 10));
      getMockClient(1).emit('error', new Error('fail'));

      await new Promise(resolve => setTimeout(resolve, 15));
      getMockClient(2).emit('error', new Error('fail'));

      await new Promise(resolve => setTimeout(resolve, 5));
      expect(maxRetriesHandler).toHaveBeenCalledWith(2);
    });

    it('forwards connected event from underlying connection', async () => {
      const connectedHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, defaultOptions);
      session.on('connected', connectedHandler);
      
      await connectWithReadyEmit(session);

      expect(connectedHandler).toHaveBeenCalledWith(serverConfig.id);
    });

    it('forwards error event from underlying connection', async () => {
      const errorHandler = vi.fn();
      const session = new SessionKeeper(serverConfig, defaultOptions);
      session.on('error', errorHandler);
      
      const mockClient = getMockClient();
      const testError = new Error('Connection error');
      
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('error', testError));

      await expect(connectPromise).rejects.toThrow();
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });
  });

  describe('Health check', () => {
    it('returns healthy status when connected', async () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);
      await connectWithReadyEmit(session);

      const health = session.healthCheck();
      
      expect(health.connected).toBe(true);
      expect(health.idle).toBe(false);
      expect(health.reconnecting).toBe(false);
    });

    it('returns idle status when connection is idle', async () => {
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        idleTimeoutMs: 50,
      });
      await connectWithReadyEmit(session);

      await new Promise(resolve => setTimeout(resolve, 60));

      const health = session.healthCheck();
      
      expect(health.connected).toBe(true);
      expect(health.idle).toBe(true);
    });

    it('returns reconnecting status during reconnection', async () => {
      const session = new SessionKeeper(serverConfig, {
        ...defaultOptions,
        baseReconnectDelayMs: 100,
      });
      await connectWithReadyEmit(session);
      getMockClient().emit('close');

      await new Promise(resolve => setTimeout(resolve, 10));

      const health = session.healthCheck();
      
      expect(health.connected).toBe(false);
      expect(health.reconnecting).toBe(true);
      expect(health.reconnectAttempt).toBe(1);
    });

    it('includes lastActivity in health check', async () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);

      const beforeConnect = Date.now();
      await connectWithReadyEmit(session);

      const health = session.healthCheck();
      
      expect(health.lastActivity).toBeGreaterThanOrEqual(beforeConnect);
    });
  });

  describe('Properties', () => {
    it('exposes server id', () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);
      expect(session.id).toBe('test-server');
    });

    it('exposes isConnected status', async () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);

      expect(session.isConnected).toBe(false);

      await connectWithReadyEmit(session);

      expect(session.isConnected).toBe(true);
    });

    it('exposes underlying connection client', async () => {
      const session = new SessionKeeper(serverConfig, defaultOptions);
      const mockClient = getMockClient();

      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;

      expect(session.client).toBe(mockClient);
    });
  });
});
