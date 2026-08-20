import * as net from 'node:net';
export function createRemoteForward(config, registry) {
    const { client, serverId, remoteHost, remotePort, localHost, localPort } = config;
    return new Promise((resolve, reject) => {
        const activeChannels = new Set();
        const tcpHandler = (info, accept, _reject) => {
            const forward = registry.get(serverId, info.destIP, info.destPort);
            if (!forward)
                return;
            if (forward.remoteHost !== remoteHost || forward.boundPort !== info.destPort)
                return;
            const channel = accept();
            activeChannels.add(channel);
            const localSocket = net.connect(localPort, localHost, () => {
                channel.pipe(localSocket);
                localSocket.pipe(channel);
            });
            localSocket.on('error', () => {
                channel.close();
                activeChannels.delete(channel);
            });
            channel.on('error', () => {
                localSocket.destroy();
                activeChannels.delete(channel);
            });
            channel.on('close', () => {
                localSocket.destroy();
                activeChannels.delete(channel);
            });
            localSocket.on('close', () => {
                channel.close();
                activeChannels.delete(channel);
            });
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.on('tcp connection', tcpHandler);
        client.forwardIn(remoteHost, remotePort, (err, boundPort) => {
            if (err) {
                client.off('tcp connection', tcpHandler);
                reject(err);
                return;
            }
            const actualPort = remotePort === 0 ? boundPort : remotePort;
            const forward = {
                serverId,
                client,
                remoteHost,
                remotePort: actualPort,
                boundPort: actualPort,
                localHost,
                localPort,
                activeChannels,
                createdAt: Date.now(),
            };
            registry.add(forward);
            resolve({
                remoteHost,
                remotePort: actualPort,
                boundPort: actualPort,
            });
        });
    });
}
export function closeRemoteForward(client, remoteHost, boundPort) {
    return new Promise((resolve, reject) => {
        client.unforwardIn(remoteHost, boundPort, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}
//# sourceMappingURL=remote-forward.js.map