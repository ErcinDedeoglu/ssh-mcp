import * as net from 'node:net';
export function createLocalForward(config, registry) {
    const { client, serverId, localHost, localPort, remoteHost, remotePort } = config;
    return new Promise((resolve, reject) => {
        const activeSockets = new Set();
        const localServer = net.createServer((socket) => {
            activeSockets.add(socket);
            socket.on('close', () => {
                activeSockets.delete(socket);
            });
            socket.on('error', () => {
                socket.destroy();
                activeSockets.delete(socket);
            });
            try {
                client.forwardOut(localHost, localPort, remoteHost, remotePort, (err, stream) => {
                    if (err) {
                        socket.destroy();
                        activeSockets.delete(socket);
                        return;
                    }
                    socket.pipe(stream).pipe(socket);
                    stream.on('error', () => {
                        socket.destroy();
                    });
                    stream.on('close', () => {
                        socket.end();
                    });
                    socket.on('close', () => {
                        stream.close();
                    });
                });
            }
            catch {
                socket.destroy();
                activeSockets.delete(socket);
            }
        });
        localServer.on('error', (serverError) => {
            reject(serverError);
        });
        localServer.listen(localPort, localHost, () => {
            const address = localServer.address();
            if (!address || typeof address === 'string') {
                localServer.close();
                reject(new Error('Failed to get server address'));
                return;
            }
            const forward = {
                serverId,
                localHost: address.address,
                localPort: address.port,
                remoteHost,
                remotePort,
                server: localServer,
                activeSockets,
                createdAt: Date.now(),
            };
            registry.add(forward);
            resolve({
                localHost: address.address,
                localPort: address.port,
            });
        });
    });
}
//# sourceMappingURL=local-forward.js.map