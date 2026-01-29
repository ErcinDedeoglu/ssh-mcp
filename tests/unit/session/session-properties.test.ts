// SessionKeeper tests: public properties (id, isConnected, client).
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

describe('SessionKeeper properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockInstances);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('exposes server id', () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());
    expect(session.id).toBe('test-server');
  });

  it('exposes isConnected status', async () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());

    expect(session.isConnected).toBe(false);

    await connectWithReadyEmit(mockInstances, session);

    expect(session.isConnected).toBe(true);
  });

  it('exposes underlying connection client', async () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());
    const mockClient = getMockClient(mockInstances);

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    expect(session.client).toBe(mockClient);
  });
});
