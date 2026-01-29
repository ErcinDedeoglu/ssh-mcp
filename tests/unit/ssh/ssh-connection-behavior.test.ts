/**
 * SSHConnection tests: events, error handling, and edge cases.
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

  describe('Edge Cases', () => {
    it('throws on invalid passphrase for encrypted key', async () => {
      const connection = new SSHConnection(serverConfigKey);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() =>
        mockClient.emit(
          'error',
          new Error('Encrypted private key detected, but no passphrase given'),
        ),
      );
      await expect(connectPromise).rejects.toThrow(/passphrase/i);
    });

    it('throws on wrong passphrase for encrypted key', async () => {
      const connection = new SSHConnection(serverConfigKey);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() =>
        mockClient.emit('error', new Error('Cannot parse privateKey: bad decrypt')),
      );
      await expect(connectPromise).rejects.toThrow(/decrypt/i);
    });

    it('handles network interruption during connection', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('error', new Error('ECONNREFUSED: Connection refused')));
      await expect(connectPromise).rejects.toThrow(/ECONNREFUSED/i);
    });

    it('handles host unreachable error', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('error', new Error('EHOSTUNREACH: No route to host')));
      await expect(connectPromise).rejects.toThrow(/EHOSTUNREACH/i);
    });

    it('handles DNS resolution failure', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('error', new Error('ENOTFOUND: getaddrinfo ENOTFOUND')));
      await expect(connectPromise).rejects.toThrow(/ENOTFOUND/i);
    });

    it('emits error event even without listeners when error occurs after connection', async () => {
      const connection = new SSHConnection(serverConfigPassword);
      const mockClient = getMockClient();
      const connectPromise = connection.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      const errorHandler = vi.fn();
      connection.on('error', errorHandler);
      mockClient.emit('error', new Error('Connection reset by peer'));
      expect(errorHandler).toHaveBeenCalled();
    });
  });
});
