import { failureFrom } from './types.js';
export async function disconnectServer(input, deps) {
    try {
        const { serverId } = input;
        if (!deps.pool.has(serverId)) {
            return { ok: false, message: `No active connection to server '${serverId}'` };
        }
        const hadShell = deps.shellRegistry.has(serverId);
        deps.shellRegistry.remove(serverId);
        deps.pool.remove(serverId);
        return {
            ok: true,
            data: {
                status: 'disconnected',
                serverId,
                message: `Disconnected from ${serverId}`,
                shellHistoryCleared: hadShell,
            },
        };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=disconnect.js.map