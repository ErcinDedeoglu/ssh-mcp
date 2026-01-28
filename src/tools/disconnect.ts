import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { sanitizeError } from './utils.js';

export const disconnectInputSchema = z.object({
  serverId: z.string().describe('Unique identifier of the server to disconnect from'),
});

export function registerDisconnectTool(
  server: McpServer,
  pool: ConnectionPool
): void {
  server.tool(
    'disconnect',
    'Close an SSH connection to a server',
    disconnectInputSchema.shape,
    async ({ serverId }) => {
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
    }
  );
}
