import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { sanitizeError } from './utils.js';

export function registerListForwardsTool(
  server: McpServer,
  forwardRegistry: ForwardRegistry,
  remoteForwardRegistry: RemoteForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'list_forwards',
    'List all active port forwards (local and remote), optionally filtered by server ID.',
    {
      serverId: z
        .string()
        .optional()
        .describe('Filter by server ID (optional, lists all if not specified)'),
    },
    async ({ serverId }: { serverId?: string }) => {
      try {
        const localForwards = serverId
          ? forwardRegistry.listByServer(serverId)
          : forwardRegistry.listAll();

        const localList = localForwards.map((f) => ({
          type: 'local' as const,
          serverId: f.serverId,
          localHost: f.localHost,
          localPort: f.localPort,
          remoteHost: f.remoteHost,
          remotePort: f.remotePort,
          activeConnections: f.activeSockets.size,
          createdAt: new Date(f.createdAt).toISOString(),
          connectionString: `${f.localHost}:${f.localPort} -> ${f.remoteHost}:${f.remotePort}`,
        }));

        const remoteForwards = serverId
          ? remoteForwardRegistry.listByServer(serverId)
          : remoteForwardRegistry.listAll();

        const remoteList = remoteForwards.map((f) => ({
          type: 'remote' as const,
          serverId: f.serverId,
          remoteHost: f.remoteHost,
          remotePort: f.remotePort,
          localHost: f.localHost,
          localPort: f.localPort,
          activeConnections: f.activeChannels.size,
          createdAt: new Date(f.createdAt).toISOString(),
          connectionString: `${f.remoteHost}:${f.remotePort} -> ${f.localHost}:${f.localPort}`,
        }));

        const allForwards = [...localList, ...remoteList];

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: allForwards.length,
                localCount: localList.length,
                remoteCount: remoteList.length,
                forwards: allForwards,
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
