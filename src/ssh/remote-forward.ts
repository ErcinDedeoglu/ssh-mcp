import * as net from 'node:net';
import type { Client, ClientChannel, TcpConnectionDetails } from 'ssh2';
import { RemoteForwardRegistry, type ActiveRemoteForward } from './remote-forward-registry.js';

export interface RemoteForwardConfig {
  client: Client;
  serverId: string;
  remoteHost: string;
  remotePort: number;
  localHost: string;
  localPort: number;
}

export interface RemoteForwardResult {
  remoteHost: string;
  remotePort: number;
  boundPort: number;
}

type TcpConnectionHandler = (
  details: TcpConnectionDetails,
  accept: () => ClientChannel,
  reject: () => boolean,
) => void;

export function createRemoteForward(
  config: RemoteForwardConfig,
  registry: RemoteForwardRegistry,
): Promise<RemoteForwardResult> {
  const { client, serverId, remoteHost, remotePort, localHost, localPort } = config;

  return new Promise((resolve, reject) => {
    const activeChannels = new Set<ClientChannel>();

    const tcpHandler: TcpConnectionHandler = (info, accept, _reject) => {
      const forward = registry.get(serverId, info.destIP, info.destPort);
      if (!forward) return;
      if (forward.remoteHost !== remoteHost || forward.boundPort !== info.destPort) return;

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
    (client as any).on('tcp connection', tcpHandler);

    client.forwardIn(remoteHost, remotePort, (err: Error | undefined, boundPort: number) => {
      if (err) {
        client.off('tcp connection', tcpHandler);
        reject(err);
        return;
      }

      const actualPort = remotePort === 0 ? boundPort : remotePort;

      const forward: ActiveRemoteForward = {
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

export function closeRemoteForward(
  client: Client,
  remoteHost: string,
  boundPort: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.unforwardIn(remoteHost, boundPort, (err?: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
