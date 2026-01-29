import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { createLocalForward } from '../ssh/local-forward.js';
import { sanitizeError } from './utils.js';

const DEFAULT_LOCAL_HOST = '127.0.0.1';
const DEFAULT_LOCAL_PORT = 0;

export function registerForwardPortTool(
  server: McpServer,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'forward_port',
    'Create a local port forward through an SSH connection. Listens on a local port and forwards connections to a remote host:port through the SSH tunnel. Use this to access remote databases, internal APIs, or services only accessible from the SSH server.',
    {
      serverId: z
        .string()
        .describe('Unique identifier of the connected SSH server to tunnel through'),
      remoteHost: z
        .string()
        .describe('Remote host to forward to (e.g., "localhost", "192.168.1.100", "db.internal")'),
      remotePort: z
        .number()
        .int()
        .positive()
        .describe('Remote port to forward to (e.g., 5432 for PostgreSQL, 3306 for MySQL)'),
      localHost: z
        .string()
        .optional()
        .describe('Local interface to bind to (default: "127.0.0.1")'),
      localPort: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Local port to listen on (default: 0 for auto-assign, or specify like 15432)'),
    },
    async ({
      serverId,
      remoteHost,
      remotePort,
      localHost,
      localPort,
    }: {
      serverId: string;
      remoteHost: string;
      remotePort: number;
      localHost?: string;
      localPort?: number;
    }) => {
      const bindHost = localHost ?? DEFAULT_LOCAL_HOST;
      const bindPort = localPort ?? DEFAULT_LOCAL_PORT;

      try {
        const session = pool.get(serverId);
        if (!session) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `No active connection to server '${serverId}'. Use connect tool first.`,
              },
            ],
          };
        }

        if (!session.isConnected) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Connection to '${serverId}' is not active. Reconnect required.`,
              },
            ],
          };
        }

        const result = await createLocalForward(
          {
            client: session.client,
            serverId,
            localHost: bindHost,
            localPort: bindPort,
            remoteHost,
            remotePort,
          },
          forwardRegistry,
        );

        session.touch();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'forwarding',
                serverId,
                localHost: result.localHost,
                localPort: result.localPort,
                remoteHost,
                remotePort,
                connectionString: `${result.localHost}:${result.localPort} -> ${remoteHost}:${remotePort}`,
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
