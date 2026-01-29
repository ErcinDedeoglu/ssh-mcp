import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { closeRemoteForward } from '../ssh/remote-forward.js';
import { sanitizeError } from './utils.js';

const DEFAULT_REMOTE_HOST = '127.0.0.1';

export function registerCloseRemoteForwardTool(
  server: McpServer,
  pool: ConnectionPool,
  remoteForwardRegistry: RemoteForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'close_remote_forward',
    'Close an active remote port forward. Stops the SSH server listener and closes all tunneled connections.',
    {
      serverId: z.string().describe('Server ID of the SSH connection'),
      remotePort: z
        .number()
        .int()
        .positive()
        .max(65535, 'Port must be at most 65535')
        .describe('Remote port of the forward to close'),
      remoteHost: z
        .string()
        .min(1, 'Remote host cannot be empty')
        .optional()
        .describe('Remote interface the forward is bound to (default: "127.0.0.1")'),
    },
    async ({
      serverId,
      remotePort,
      remoteHost,
    }: {
      serverId: string;
      remotePort: number;
      remoteHost?: string;
    }) => {
      const bindHost = remoteHost ?? DEFAULT_REMOTE_HOST;

      try {
        const forward = remoteForwardRegistry.get(serverId, bindHost, remotePort);

        if (!forward) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `No active remote forward found for ${serverId} on ${bindHost}:${remotePort}`,
              },
            ],
          };
        }

        const session = pool.get(serverId);
        if (session?.isConnected) {
          await closeRemoteForward(session.client, bindHost, forward.boundPort);
        }

        const forwardInfo = {
          serverId: forward.serverId,
          remoteHost: forward.remoteHost,
          remotePort: forward.remotePort,
          localHost: forward.localHost,
          localPort: forward.localPort,
          activeConnections: forward.activeChannels.size,
        };

        remoteForwardRegistry.remove(serverId, bindHost, remotePort);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'closed',
                ...forwardInfo,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: sanitizeError(error),
            },
          ],
        };
      }
    },
  );
}
