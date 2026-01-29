import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { sanitizeError } from './utils.js';

export function registerDisconnectTool(server: McpServer, pool: ConnectionPool): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'disconnect',
    'Close an SSH connection to a server',
    { serverId: z.string().describe('Unique identifier of the server to disconnect from') },
    async ({ serverId }: { serverId: string }) => {
      try {
        if (!pool.has(serverId)) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `No active connection to server '${serverId}'`,
              },
            ],
          };
        }

        pool.remove(serverId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'disconnected',
                serverId,
                message: `Disconnected from ${serverId}`,
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
