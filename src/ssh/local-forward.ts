import * as net from 'node:net';
import type { Client, ClientChannel } from 'ssh2';
import { ForwardRegistry, type ActiveForward } from './forward-registry.js';

export interface LocalForwardConfig {
  client: Client;
  serverId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface LocalForwardResult {
  localHost: string;
  localPort: number;
}

export function createLocalForward(
  config: LocalForwardConfig,
  registry: ForwardRegistry,
): Promise<LocalForwardResult> {
  const { client, serverId, localHost, localPort, remoteHost, remotePort } = config;

  return new Promise((resolve, reject) => {
    const activeSockets = new Set<net.Socket>();

    const localServer = net.createServer((socket: net.Socket) => {
      activeSockets.add(socket);

      socket.on('close', () => {
        activeSockets.delete(socket);
      });

      socket.on('error', () => {
        socket.destroy();
        activeSockets.delete(socket);
      });

      try {
        client.forwardOut(
          localHost,
          localPort,
          remoteHost,
          remotePort,
          (err: Error | undefined, stream: ClientChannel) => {
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
          },
        );
      } catch {
        socket.destroy();
        activeSockets.delete(socket);
      }
    });

    localServer.on('error', (serverError: Error) => {
      reject(serverError);
    });

    localServer.listen(localPort, localHost, () => {
      const address = localServer.address();
      if (!address || typeof address === 'string') {
        localServer.close();
        reject(new Error('Failed to get server address'));
        return;
      }

      const forward: ActiveForward = {
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
