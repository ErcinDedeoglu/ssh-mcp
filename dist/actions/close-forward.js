import { failureFrom } from './types.js';
const DEFAULT_LOCAL_HOST = '127.0.0.1';
export async function closeForward(input, deps) {
    try {
        const bindHost = input.localHost ?? DEFAULT_LOCAL_HOST;
        const forward = deps.forwardRegistry.get(bindHost, input.localPort);
        if (!forward) {
            return { ok: false, message: `No active forward found on ${bindHost}:${input.localPort}` };
        }
        const forwardInfo = {
            serverId: forward.serverId,
            localHost: forward.localHost,
            localPort: forward.localPort,
            remoteHost: forward.remoteHost,
            remotePort: forward.remotePort,
            activeConnections: forward.activeSockets.size,
        };
        deps.forwardRegistry.remove(bindHost, input.localPort);
        return { ok: true, data: { status: 'closed', ...forwardInfo } };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=close-forward.js.map