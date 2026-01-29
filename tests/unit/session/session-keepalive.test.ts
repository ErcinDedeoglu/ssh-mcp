// SessionKeeper tests: keep-alive configuration passed to ssh2.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  createServerConfig,
  createDefaultOptions,
  clearMockInstances,
  getMockClient,
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

describe('SessionKeeper keep-alive configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockInstances);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('passes keepaliveInterval to ssh2 ConnectConfig', async () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());
    const mockClient = getMockClient(mockInstances);

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        keepaliveInterval: 30000,
      }),
    );
  });

  it('passes keepaliveCountMax to ssh2 ConnectConfig', async () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());
    const mockClient = getMockClient(mockInstances);

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        keepaliveCountMax: 3,
      }),
    );
  });

  it('uses default keep-alive values when not specified', async () => {
    const session = new SessionKeeper(createServerConfig());
    const mockClient = getMockClient(mockInstances);

    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;

    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        keepaliveInterval: 30000,
        keepaliveCountMax: 3,
      }),
    );
  });
});
