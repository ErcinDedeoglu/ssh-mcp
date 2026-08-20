export const DEFAULT_KEEPALIVE_INTERVAL_MS = 30000;
export const DEFAULT_KEEPALIVE_COUNT_MAX = 3;
export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
export const DEFAULT_BASE_RECONNECT_DELAY_MS = 1000;
export const DEFAULT_MAX_RECONNECT_DELAY_MS = 30000;
export const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 10;
export const MS_PER_SECOND = 1000;
export function calculateReconnectDelay(attempt, baseDelayMs, maxDelayMs) {
    const delay = baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, maxDelayMs);
}
export function safeEmitError(emitter, err) {
    if (emitter.listenerCount('error') > 0) {
        emitter.emit('error', err);
    }
}
//# sourceMappingURL=session.types.js.map