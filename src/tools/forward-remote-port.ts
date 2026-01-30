import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { createRemoteForward } from '../ssh/remote-forward.js';
import { ensureConnected, formatConnectionError } from './ensure-connected.js';
import { sanitizeError } from './utils.js';

const DEFAULT_REMOTE_HOST = '127.0.0.1';
const DEFAULT_REMOTE_PORT = 0;

export function registerForwardRemotePortTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
  remoteForwardRegistry: RemoteForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'forward_remote_port',
    'Create a remote port forward to expose a local service on the SSH server. The SSH server listens on a port and forwards incoming connections to a local host:port. Use this to expose local development servers, databases, or APIs to the remote server.',
    {
      serverId: z.string().describe('Unique identifier of the connected SSH server'),
      localHost: z
        .string()
        .min(1, 'Local host cannot be empty')
        .describe('Local host to forward connections to (e.g., "localhost", "127.0.0.1")'),
      localPort: z
        .number()
        .int()
        .positive()
        .max(65535, 'Port must be at most 65535')
        .describe(
          'Local port to forward connections to (e.g., 3000 for dev server, 5432 for PostgreSQL)',
        ),
      remoteHost: z
        .string()
        .min(1, 'Remote host cannot be empty')
        .optional()
        .describe('Remote interface to bind on SSH server (default: "127.0.0.1")'),
      remotePort: z
        .number()
        .int()
        .min(0)
        .max(65535, 'Port must be at most 65535')
        .optional()
        .describe('Remote port to listen on SSH server (default: 0 for auto-assign)'),
    },
    async ({
      serverId,
      localHost,
      localPort,
      remoteHost,
      remotePort,
    }: {
      serverId: string;
      localHost: string;
      localPort: number;
      remoteHost?: string;
      remotePort?: number;
    }) => {
      const bindHost = remoteHost ?? DEFAULT_REMOTE_HOST;
      const bindPort = remotePort ?? DEFAULT_REMOTE_PORT;

      try {
        const connectionResult = await ensureConnected(serverId, { config, pool, forwardRegistry });
        if (!connectionResult.success) {
          return formatConnectionError(connectionResult.errorInfo);
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
          remoteForwardRegistry,
        );

        session.touch();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'forwarding',
                serverId,
                remoteHost: result.remoteHost,
                remotePort: result.boundPort,
                localHost,
                localPort,
                connectionString: `${result.remoteHost}:${result.boundPort} -> ${localHost}:${localPort}`,
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
