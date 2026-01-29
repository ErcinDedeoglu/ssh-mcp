// SessionKeeper tests: idle timeout tracking and touch() behavior.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  createServerConfig,
  createDefaultOptions,
  clearMockInstances,
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

describe('SessionKeeper idle timeout tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances(mockInstances);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('tracks last activity timestamp on connect', async () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());

    const beforeConnect = Date.now();
    await connectWithReadyEmit(mockInstances, session);
    const afterConnect = Date.now();

    expect(session.lastActivity).toBeGreaterThanOrEqual(beforeConnect);
    expect(session.lastActivity).toBeLessThanOrEqual(afterConnect);
  });

  it('updates last activity on touch()', async () => {
    const session = new SessionKeeper(createServerConfig(), createDefaultOptions());
    await connectWithReadyEmit(mockInstances, session);

    const initialActivity = session.lastActivity;

    await new Promise((resolve) => setTimeout(resolve, 10));
    session.touch();

    expect(session.lastActivity).toBeGreaterThan(initialActivity);
  });

  it('marks connection as idle after timeout', async () => {
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ idleTimeoutMs: 50 }),
    );
    await connectWithReadyEmit(mockInstances, session);

    expect(session.isIdle).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(session.isIdle).toBe(true);
  });

  it('resets idle status on touch()', async () => {
    const session = new SessionKeeper(
      createServerConfig(),
      createDefaultOptions({ idleTimeoutMs: 50 }),
    );
    await connectWithReadyEmit(mockInstances, session);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(session.isIdle).toBe(true);

    session.touch();

    expect(session.isIdle).toBe(false);
  });
});
