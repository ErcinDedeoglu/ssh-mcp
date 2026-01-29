// SessionKeeper types, interfaces, and configuration constants.

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
}

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
