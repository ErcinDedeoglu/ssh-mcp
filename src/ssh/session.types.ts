// SessionKeeper types, interfaces, constants, and pure utility functions.
import type { EventEmitter } from 'node:events';
import type { Duplex } from 'node:stream';

export const DEFAULT_KEEPALIVE_INTERVAL_MS = 30000;
export const DEFAULT_KEEPALIVE_COUNT_MAX = 3;
export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
export const DEFAULT_BASE_RECONNECT_DELAY_MS = 1000;
export const DEFAULT_MAX_RECONNECT_DELAY_MS = 30000;
export const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 10;
export const MS_PER_SECOND = 1000;

export interface SessionKeeperOptions {
  keepaliveIntervalMs?: number;
  keepaliveCountMax?: number;
  idleTimeoutMs?: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  jumpStream?: Duplex;
}

export type ResolvedSessionOptions = Omit<Required<SessionKeeperOptions>, 'jumpStream'> & {
  jumpStream?: Duplex;
};

export interface SessionKeeperEvents {
  connected: (serverId: string) => void;
  disconnected: (serverId: string) => void;
  error: (error: Error) => void;
  reconnecting: (attempt: number, delayMs: number) => void;
  reconnected: (attempts: number) => void;
  'max-retries-reached': (attempts: number) => void;
}

export interface HealthStatus {
  connected: boolean;
  idle: boolean;
  reconnecting: boolean;
  reconnectAttempt?: number;
  lastActivity: number;
}

export function calculateReconnectDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const delay = baseDelayMs * Math.pow(2, attempt - 1);
  return Math.min(delay, maxDelayMs);
}

export function safeEmitError(emitter: EventEmitter, err: Error): void {
  if (emitter.listenerCount('error') > 0) {
    emitter.emit('error', err);
  }
}
