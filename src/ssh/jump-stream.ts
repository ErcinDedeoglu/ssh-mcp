// Creates a TCP tunnel stream through an SSH connection for jump host connections.
import type { ClientChannel } from 'ssh2';
import type { SessionKeeper } from './session.js';

export interface JumpStreamOptions {
  srcHost?: string;
  srcPort?: number;
}

const DEFAULT_SRC_HOST = '127.0.0.1';
const DEFAULT_SRC_PORT = 0;

export function createJumpStream(
  jumpSession: SessionKeeper,
  targetHost: string,
  targetPort: number,
  options: JumpStreamOptions = {},
): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    if (!jumpSession.isConnected) {
      reject(new Error(`Jump host '${jumpSession.id}' is not connected`));
      return;
    }

    const srcHost = options.srcHost ?? DEFAULT_SRC_HOST;
    const srcPort = options.srcPort ?? DEFAULT_SRC_PORT;

    jumpSession.client.forwardOut(srcHost, srcPort, targetHost, targetPort, (err, stream) => {
      if (err) {
        reject(new Error(`Failed to create tunnel through '${jumpSession.id}': ${err.message}`));
        return;
      }
      resolve(stream);
    });
  });
}
