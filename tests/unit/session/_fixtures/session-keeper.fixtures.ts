/**
 * Shared fixtures and helpers for SessionKeeper unit tests.
 * Provides config factories, mock types, and utility functions.
 */
import { vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerConfig, PasswordAuth } from '../../../../src/config/types.js';
import type { SessionKeeperOptions } from '../../../../src/ssh/session.js';

/** Mock SSH client type matching ssh2 Client interface for testing. */
export type MockClientType = EventEmitter & {
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

/** Creates a default test server configuration with password auth. */
export function createServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    id: 'test-server',
    host: '192.168.1.100',
    port: 22,
    username: 'ubuntu',
    auth: { password: 'secret123' } as PasswordAuth,
    ...overrides,
  };
}

/** Creates default SessionKeeper options for testing. */
export function createDefaultOptions(
  overrides: Partial<SessionKeeperOptions> = {},
): SessionKeeperOptions {
  return {
    keepaliveIntervalMs: 30000,
    keepaliveCountMax: 3,
    idleTimeoutMs: 15 * 60 * 1000,
    maxReconnectAttempts: 5,
    baseReconnectDelayMs: 1000,
    maxReconnectDelayMs: 30000,
    ...overrides,
  };
}

/** Clears the mock instances array between tests. */
export function clearMockInstances(mockInstances: EventEmitter[]): void {
  mockInstances.length = 0;
}

/** Retrieves a mock client from the instances array. */
export function getMockClient(mockInstances: EventEmitter[], index = 0): MockClientType {
  return mockInstances[index] as MockClientType;
}

/** Connects a session and emits ready event on the mock client. */
export async function connectWithReadyEmit(
  mockInstances: EventEmitter[],
  session: { connect: () => Promise<void> },
  clientIndex = 0,
): Promise<void> {
  const connectPromise = session.connect();
  setImmediate(() => getMockClient(mockInstances, clientIndex).emit('ready'));
  await connectPromise;
}
