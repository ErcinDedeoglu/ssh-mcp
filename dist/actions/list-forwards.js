import { failureFrom } from './types.js';
export async function listForwards(input, deps) {
    try {
        const { serverId } = input;
        const localForwards = serverId
            ? deps.forwardRegistry.listByServer(serverId)
            : deps.forwardRegistry.listAll();
        const localList = localForwards.map((f) => ({
            type: 'local',
            serverId: f.serverId,
            localHost: f.localHost,
            localPort: f.localPort,
            remoteHost: f.remoteHost,
            remotePort: f.remotePort,
            activeConnections: f.activeSockets.size,
            createdAt: new Date(f.createdAt).toISOString(),
            connectionString: `${f.localHost}:${f.localPort} -> ${f.remoteHost}:${f.remotePort}`,
        }));
        const remoteForwards = serverId
            ? deps.remoteForwardRegistry.listByServer(serverId)
            : deps.remoteForwardRegistry.listAll();
        const remoteList = remoteForwards.map((f) => ({
            type: 'remote',
            serverId: f.serverId,
            remoteHost: f.remoteHost,
            remotePort: f.remotePort,
            localHost: f.localHost,
            localPort: f.localPort,
            activeConnections: f.activeChannels.size,
            createdAt: new Date(f.createdAt).toISOString(),
            connectionString: `${f.remoteHost}:${f.remotePort} -> ${f.localHost}:${f.localPort}`,
        }));
        const allForwards = [...localList, ...remoteList];
        return {
            ok: true,
            data: {
                count: allForwards.length,
                localCount: localList.length,
                remoteCount: remoteList.length,
                forwards: allForwards,
            },
        };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=list-forwards.js.map