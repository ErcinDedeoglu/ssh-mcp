// SessionKeeper tests: healthCheck() method returning connection status.
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

describe('SessionKeeper health check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockInstances);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns healthy status when connected', async () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());
    await connectWithReadyEmit(mockInstances, session);

    const health = session.healthCheck();

    expect(health.connected).toBe(true);
    expect(health.idle).toBe(false);
    expect(health.reconnecting).toBe(false);
  });

  it('returns idle status when connection is idle', async () => {
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ idleTimeoutMs: 50 }),
    );
    await connectWithReadyEmit(mockInstances, session);

    await new Promise((resolve) => setTimeout(resolve, 60));

    const health = session.healthCheck();

    expect(health.connected).toBe(true);
    expect(health.idle).toBe(true);
  });

  it('returns reconnecting status during reconnection', async () => {
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ baseReconnectDelayMs: 100 }),
    );
    await connectWithReadyEmit(mockInstances, session);
    getMockClient(mockInstances).emit('close');

    await new Promise((resolve) => setTimeout(resolve, 10));

    const health = session.healthCheck();

    expect(health.connected).toBe(false);
    expect(health.reconnecting).toBe(true);
    expect(health.reconnectAttempt).toBe(1);
  });

  it('includes lastActivity in health check', async () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());

    const beforeConnect = Date.now();
    await connectWithReadyEmit(mockInstances, session);

    const health = session.healthCheck();

    expect(health.lastActivity).toBeGreaterThanOrEqual(beforeConnect);
  });
});
