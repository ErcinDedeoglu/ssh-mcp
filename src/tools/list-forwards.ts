import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { sanitizeError } from './utils.js';

export function registerListForwardsTool(
  server: McpServer,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'list_forwards',
    'List all active port forwards, optionally filtered by server ID.',
    {
      serverId: z
        .string()
        .optional()
        .describe('Filter by server ID (optional, lists all if not specified)'),
    },
    async ({ serverId }: { serverId?: string }) => {
      try {
        const forwards = serverId
          ? forwardRegistry.listByServer(serverId)
          : forwardRegistry.listAll();

        const forwardList = forwards.map((f) => ({
          serverId: f.serverId,
          localHost: f.localHost,
          localPort: f.localPort,
          remoteHost: f.remoteHost,
          remotePort: f.remotePort,
          activeConnections: f.activeSockets.size,
          createdAt: new Date(f.createdAt).toISOString(),
          connectionString: `${f.localHost}:${f.localPort} -> ${f.remoteHost}:${f.remotePort}`,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: forwardList.length,
                forwards: forwardList,
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
