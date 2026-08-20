import type { EventEmitter } from 'node:events';
import type { Duplex } from 'node:stream';
export declare const DEFAULT_KEEPALIVE_INTERVAL_MS = 30000;
export declare const DEFAULT_KEEPALIVE_COUNT_MAX = 3;
export declare const DEFAULT_IDLE_TIMEOUT_MS: number;
export declare const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
export declare const DEFAULT_BASE_RECONNECT_DELAY_MS = 1000;
export declare const DEFAULT_MAX_RECONNECT_DELAY_MS = 30000;
export declare const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 10;
export declare const MS_PER_SECOND = 1000;
export interface SessionKeeperOptions {
    keepaliveIntervalMs?: number;
    keepaliveCountMax?: number;
    idleTimeoutMs?: number;
    maxReconnectAttempts?: number;
    baseReconnectDelayMs?: number;
    maxReconnectDelayMs?: number;
    jumpStream?: Duplex;
    keys?: Record<string, string>;
}
export type ResolvedSessionOptions = Omit<Required<SessionKeeperOptions>, 'jumpStream' | 'keys'> & {
    jumpStream?: Duplex;
    keys?: Record<string, string>;
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
export declare function calculateReconnectDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number;
export declare function safeEmitError(emitter: EventEmitter, err: Error): void;
//# sourceMappingURL=session.types.d.ts.map