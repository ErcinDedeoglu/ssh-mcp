// SessionKeeper tests: auto-reconnection with exponential backoff.
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

describe('SessionKeeper auto-reconnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockInstances);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reconnects after unexpected disconnect', async () => {
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ baseReconnectDelayMs: 10 }),
    );
    const reconnectedHandler = vi.fn();
    session.on('reconnected', reconnectedHandler);

    await connectWithReadyEmit(mockInstances, session, 0);
    const mockClient1 = getMockClient(mockInstances, 0);

    mockClient1.emit('close');

    await new Promise((resolve) => setTimeout(resolve, 30));
    const mockClient2 = getMockClient(mockInstances, 1);
    mockClient2.emit('ready');

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(reconnectedHandler).toHaveBeenCalled();
    expect(session.isConnected).toBe(true);
  });

  it('uses exponential backoff for reconnection delays', async () => {
    const reconnectingHandler = vi.fn();
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ baseReconnectDelayMs: 10, maxReconnectDelayMs: 1000 }),
    );
    session.on('reconnecting', reconnectingHandler);

    await connectWithReadyEmit(mockInstances, session, 0);
    getMockClient(mockInstances, 0).emit('close');

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(reconnectingHandler).toHaveBeenCalledWith(1, 10);

    getMockClient(mockInstances, 1).emit('error', new Error('fail'));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(reconnectingHandler).toHaveBeenCalledWith(2, 20);

    getMockClient(mockInstances, 2).emit('error', new Error('fail'));
    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(reconnectingHandler).toHaveBeenCalledWith(3, 40);
  });

  it('caps reconnection delay at maxReconnectDelayMs', async () => {
    const reconnectingHandler = vi.fn();
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({
        baseReconnectDelayMs: 50,
        maxReconnectDelayMs: 60,
        maxReconnectAttempts: 5,
      }),
    );
    session.on('reconnecting', reconnectingHandler);

    await connectWithReadyEmit(mockInstances, session, 0);
    getMockClient(mockInstances, 0).emit('close');

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(reconnectingHandler).toHaveBeenLastCalledWith(1, 50);

    getMockClient(mockInstances, 1).emit('error', new Error('fail'));
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(reconnectingHandler).toHaveBeenLastCalledWith(2, 60);
  });

  it('respects max reconnection attempts', async () => {
    const maxRetriesHandler = vi.fn();
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({
        maxReconnectAttempts: 3,
        baseReconnectDelayMs: 5,
        maxReconnectDelayMs: 50,
      }),
    );
    session.on('max-retries-reached', maxRetriesHandler);

    await connectWithReadyEmit(mockInstances, session, 0);
    getMockClient(mockInstances, 0).emit('close');

    await new Promise((resolve) => setTimeout(resolve, 10));
    getMockClient(mockInstances, 1).emit('error', new Error('fail'));

    await new Promise((resolve) => setTimeout(resolve, 15));
    getMockClient(mockInstances, 2).emit('error', new Error('fail'));

    await new Promise((resolve) => setTimeout(resolve, 25));
    getMockClient(mockInstances, 3).emit('error', new Error('fail'));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(maxRetriesHandler).toHaveBeenCalledWith(3);
  });

  it('does not reconnect after intentional disconnect', async () => {
    const reconnectingHandler = vi.fn();
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ baseReconnectDelayMs: 10 }),
    );
    session.on('reconnecting', reconnectingHandler);

    await connectWithReadyEmit(mockInstances, session);
    const mockClient = getMockClient(mockInstances);

    session.disconnect();
    mockClient.emit('close');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reconnectingHandler).not.toHaveBeenCalled();
  });
});
