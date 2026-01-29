// SessionKeeper tests: event emission (connected, reconnecting, reconnected, max-retries-reached, error).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  createServerConfig,
  createDefaultOptions,
  clearMockInstances,
  getMockClient,
  connectWithReadyEmit,
} from './_fixtures/session-keeper.fixtures.js';

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

describe('SessionKeeper events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockInstances);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('emits reconnecting event with attempt number and delay', async () => {
    const reconnectingHandler = vi.fn();
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ baseReconnectDelayMs: 10 }),
    );
    session.on('reconnecting', reconnectingHandler);

    await connectWithReadyEmit(mockInstances, session);
    getMockClient(mockInstances).emit('close');

    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(reconnectingHandler).toHaveBeenCalledWith(1, 10);
  });

  it('emits reconnected event on successful reconnection', async () => {
    const reconnectedHandler = vi.fn();
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ baseReconnectDelayMs: 10 }),
    );
    session.on('reconnected', reconnectedHandler);

    await connectWithReadyEmit(mockInstances, session, 0);
    getMockClient(mockInstances, 0).emit('close');

    await new Promise((resolve) => setTimeout(resolve, 15));
    getMockClient(mockInstances, 1).emit('ready');

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(reconnectedHandler).toHaveBeenCalledWith(1);
  });

  it('emits max-retries-reached event after exhausting attempts', async () => {
    const maxRetriesHandler = vi.fn();
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ maxReconnectAttempts: 2, baseReconnectDelayMs: 5 }),
    );
    session.on('max-retries-reached', maxRetriesHandler);

    await connectWithReadyEmit(mockInstances, session, 0);
    getMockClient(mockInstances, 0).emit('close');

    await new Promise((resolve) => setTimeout(resolve, 10));
    getMockClient(mockInstances, 1).emit('error', new Error('fail'));

    await new Promise((resolve) => setTimeout(resolve, 15));
    getMockClient(mockInstances, 2).emit('error', new Error('fail'));

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(maxRetriesHandler).toHaveBeenCalledWith(2);
  });

  it('forwards connected event from underlying connection', async () => {
    const connectedHandler = vi.fn();
    const serverConfig = createServerConfig();
    const session = new SessionKeeper(serverConfig, createDefaultOptions());
    session.on('connected', connectedHandler);

    await connectWithReadyEmit(mockInstances, session);

    expect(connectedHandler).toHaveBeenCalledWith(serverConfig.id);
  });

  it('forwards error event from underlying connection', async () => {
    const errorHandler = vi.fn();
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());
    session.on('error', errorHandler);

    const mockClient = getMockClient(mockInstances);
    const testError = new Error('Connection error');

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('error', testError));

    await expect(connectPromise).rejects.toThrow();
    expect(errorHandler).toHaveBeenCalledWith(testError);
  });
});
