import { createLocalForward } from '../ssh/local-forward.js';
import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { failureFrom } from './types.js';
const DEFAULT_LOCAL_HOST = '127.0.0.1';
const DEFAULT_LOCAL_PORT = 0;
export async function forwardPort(input, deps) {
    try {
        const { serverId, remoteHost, remotePort } = input;
        const bindHost = input.localHost ?? DEFAULT_LOCAL_HOST;
        const bindPort = input.localPort ?? DEFAULT_LOCAL_PORT;
        const connectionResult = await ensureConnected(serverId, {
            config: deps.config,
            pool: deps.pool,
            forwardRegistry: deps.forwardRegistry,
        });
        if (!connectionResult.success) {
            return connectionFailure(connectionResult.errorInfo);
        }
        const { session } = connectionResult;
        const result = await createLocalForward({
            client: session.client,
            serverId,
            localHost: bindHost,
            localPort: bindPort,
            remoteHost,
            remotePort,
        }, deps.forwardRegistry);
        session.touch();
        return {
            ok: true,
            data: {
                status: 'forwarding',
                serverId,
                localHost: result.localHost,
                localPort: result.localPort,
                remoteHost,
                remotePort,
                connectionString: `${result.localHost}:${result.localPort} -> ${remoteHost}:${remotePort}`,
            },
        };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=forward-port.js.map