import { createRemoteForward } from '../ssh/remote-forward.js';
import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { failureFrom } from './types.js';
const DEFAULT_REMOTE_HOST = '127.0.0.1';
const DEFAULT_REMOTE_PORT = 0;
export async function forwardRemotePort(input, deps) {
    try {
        const { serverId, localHost, localPort } = input;
        const bindHost = input.remoteHost ?? DEFAULT_REMOTE_HOST;
        const bindPort = input.remotePort ?? DEFAULT_REMOTE_PORT;
        const connectionResult = await ensureConnected(serverId, {
            config: deps.config,
            pool: deps.pool,
            forwardRegistry: deps.forwardRegistry,
        });
        if (!connectionResult.success) {
            return connectionFailure(connectionResult.errorInfo);
        }
        const { session } = connectionResult;
        const result = await createRemoteForward({
            client: session.client,
            serverId,
            remoteHost: bindHost,
            remotePort: bindPort,
            localHost,
            localPort,
        }, deps.remoteForwardRegistry);
        session.touch();
        return {
            ok: true,
            data: {
                status: 'forwarding',
                serverId,
                remoteHost: result.remoteHost,
                remotePort: result.boundPort,
                localHost,
                localPort,
                connectionString: `${result.remoteHost}:${result.boundPort} -> ${localHost}:${localPort}`,
            },
        };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=forward-remote-port.js.map