import { closeRemoteForward } from '../ssh/remote-forward.js';
import { failureFrom } from './types.js';
const DEFAULT_REMOTE_HOST = '127.0.0.1';
export async function closeRemoteForwardAction(input, deps) {
    try {
        const bindHost = input.remoteHost ?? DEFAULT_REMOTE_HOST;
        const forward = deps.remoteForwardRegistry.get(input.serverId, bindHost, input.remotePort);
        if (!forward) {
            return {
                ok: false,
                message: `No active remote forward found for ${input.serverId} on ${bindHost}:${input.remotePort}`,
            };
        }
        const session = deps.pool.get(input.serverId);
        if (session?.isConnected) {
            await closeRemoteForward(session.client, bindHost, forward.boundPort);
        }
        const forwardInfo = {
            serverId: forward.serverId,
            remoteHost: forward.remoteHost,
            remotePort: forward.remotePort,
            localHost: forward.localHost,
            localPort: forward.localPort,
            activeConnections: forward.activeChannels.size,
        };
        deps.remoteForwardRegistry.remove(input.serverId, bindHost, input.remotePort);
        return { ok: true, data: { status: 'closed', ...forwardInfo } };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=close-remote-forward.js.map