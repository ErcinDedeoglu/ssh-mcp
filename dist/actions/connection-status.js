import { ping } from '../ssh/session-ping.io.js';
import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { failureFrom } from './types.js';
export function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000)
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
export async function connectionStatus(input, deps) {
    try {
        const { serverId } = input;
        const connectionResult = await ensureConnected(serverId, {
            config: deps.config,
            pool: deps.pool,
            forwardRegistry: deps.forwardRegistry,
        });
        if (!connectionResult.success) {
            return connectionFailure(connectionResult.errorInfo);
        }
        const { session } = connectionResult;
        const health = session.healthCheck();
        const isAlive = health.connected ? await ping(session.client) : false;
        const now = Date.now();
        const lastActivityAgo = health.lastActivity > 0 ? formatDuration(now - health.lastActivity) : 'never';
        const status = {
            serverId,
            connected: isAlive,
            idle: health.idle,
            reconnecting: health.reconnecting,
            lastActivityMs: health.lastActivity,
            lastActivityAgo,
        };
        if (health.idle) {
            status.idleWarning =
                'Connection has been idle for >15 minutes. Run a command to reset the idle timer.';
        }
        if (health.reconnectAttempt !== undefined) {
            status.reconnectAttempt = health.reconnectAttempt;
        }
        return { ok: true, data: status };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=connection-status.js.map