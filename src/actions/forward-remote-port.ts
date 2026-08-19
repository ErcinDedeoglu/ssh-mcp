import { createRemoteForward } from '../ssh/remote-forward.js';
import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { failureFrom, type ActionDeps, type ActionOutcome } from './types.js';

const DEFAULT_REMOTE_HOST = '127.0.0.1';
const DEFAULT_REMOTE_PORT = 0;

export interface ForwardRemotePortInput {
  serverId: string;
  localHost: string;
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
}

export interface ForwardRemotePortResult {
  status: string;
  serverId: string;
  remoteHost: string;
  remotePort: number;
  localHost: string;
  localPort: number;
  connectionString: string;
}

export async function forwardRemotePort(
  input: ForwardRemotePortInput,
  deps: ActionDeps,
): Promise<ActionOutcome<ForwardRemotePortResult>> {
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

    const result = await createRemoteForward(
      {
        client: session.client,
        serverId,
        remoteHost: bindHost,
        remotePort: bindPort,
        localHost,
        localPort,
      },
      deps.remoteForwardRegistry,
    );

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
  } catch (error) {
    return failureFrom(error);
  }
}
