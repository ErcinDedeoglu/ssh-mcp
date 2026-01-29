import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { SessionKeeper } from '../ssh/session.js';
import { sanitizeError } from './utils.js';

export function registerConnectTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'connect',
    'Connect to an SSH server. Reuses existing connection if already connected.',
    { serverId: z.string().describe('Unique identifier of the server to connect to') },
    async ({ serverId }: { serverId: string }) => {
      try {
        if (pool.has(serverId)) {
          const existingSession = pool.get(serverId);
          if (existingSession?.isConnected) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'already_connected',
                    serverId,
                    message: `Already connected to ${serverId}`,
                  }),
                },
              ],
            };
          }
        }

        const serverConfig = config.servers.find((s) => s.id === serverId);
        if (!serverConfig) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Server '${serverId}' not found in configuration`,
              },
            ],
          };
        }

        const sessionOptions = {
          idleTimeoutMs:
            (serverConfig.timeouts?.idle ?? config.defaults?.timeouts?.idle ?? 900) * 1000,
        };

        const session = new SessionKeeper(serverConfig, sessionOptions);
        session.on('disconnected', () => {
          forwardRegistry.removeByServer(serverId);
        });
        await session.connect();
        pool.add(session);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'connected',
                serverId,
                host: serverConfig.host,
                port: serverConfig.port,
                username: serverConfig.username,
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
