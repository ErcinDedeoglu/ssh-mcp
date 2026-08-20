import { refreshConfig } from './ensure-connected.js';
import { failureFrom } from './types.js';
export async function listServers(deps) {
    try {
        refreshConfig(deps.config);
        const servers = deps.config.servers.map((serverConfig) => ({
            id: serverConfig.id,
            host: serverConfig.host,
            port: serverConfig.port,
            username: serverConfig.username,
            description: serverConfig.description,
            connected: deps.pool.get(serverConfig.id)?.isConnected ?? false,
        }));
        return { ok: true, data: servers, pretty: true };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=list-servers.js.map