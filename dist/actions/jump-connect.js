import { SessionKeeper } from '../ssh/session.js';
import { createJumpStream } from '../ssh/jump-stream.js';
import { ensureConnected, connectionFailure, refreshConfig } from './ensure-connected.js';
import { failureFrom } from './types.js';
const JUMP_CONNECTION_NO_RECONNECT = 0;
export async function jumpConnect(input, deps) {
    try {
        const { jumpServerId, targetServerId } = input;
        refreshConfig(deps.config);
        if (deps.pool.has(targetServerId)) {
            const existing = deps.pool.get(targetServerId);
            if (existing?.isConnected) {
                return {
                    ok: true,
                    data: {
                        status: 'already_connected',
                        targetServerId,
                        message: `Already connected to ${targetServerId}`,
                    },
                };
            }
        }
        const jumpResult = await ensureConnected(jumpServerId, {
            config: deps.config,
            pool: deps.pool,
            forwardRegistry: deps.forwardRegistry,
            remoteForwardRegistry: deps.remoteForwardRegistry,
        });
        if (!jumpResult.success) {
            return connectionFailure(jumpResult.errorInfo);
        }
        const jumpSession = jumpResult.session;
        const targetConfig = deps.config.servers.find((s) => s.id === targetServerId);
        if (!targetConfig) {
            return {
                ok: false,
                message: `Target server '${targetServerId}' not found in configuration`,
                json: {
                    error: 'server_not_found',
                    serverId: targetServerId,
                    reason: `Target server '${targetServerId}' not found in configuration`,
                },
            };
        }
        const jumpStream = await createJumpStream(jumpSession, targetConfig.host, targetConfig.port);
        const sessionOptions = {
            idleTimeoutMs: (targetConfig.timeouts?.idle ?? deps.config.defaults?.timeouts?.idle ?? 900) * 1000,
            maxReconnectAttempts: JUMP_CONNECTION_NO_RECONNECT,
            jumpStream,
            keys: deps.config.keys,
        };
        const targetSession = new SessionKeeper(targetConfig, sessionOptions);
        targetSession.on('disconnected', () => {
            deps.forwardRegistry.removeByServer(targetServerId);
            deps.remoteForwardRegistry.removeByServer(targetServerId);
        });
        await targetSession.connect();
        deps.pool.add(targetSession);
        return {
            ok: true,
            data: {
                status: 'connected',
                targetServerId,
                jumpServerId,
                host: targetConfig.host,
                port: targetConfig.port,
                username: targetConfig.username,
                isJumpConnection: true,
            },
        };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=jump-connect.js.map