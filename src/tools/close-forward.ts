import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { sanitizeError } from './utils.js';

const DEFAULT_LOCAL_HOST = '127.0.0.1';

export function registerCloseForwardTool(
  server: McpServer,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'close_forward',
    'Close an active port forward. Stops the local listener and closes all tunneled connections.',
    {
      localPort: z.number().int().positive().describe('Local port of the forward to close'),
      localHost: z
        .string()
        .optional()
        .describe('Local interface the forward is bound to (default: "127.0.0.1")'),
    },
    async ({ localPort, localHost }: { localPort: number; localHost?: string }) => {
      const bindHost = localHost ?? DEFAULT_LOCAL_HOST;

      try {
        const forward = forwardRegistry.get(bindHost, localPort);

        if (!forward) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `No active forward found on ${bindHost}:${localPort}`,
              },
            ],
          };
        }

        const forwardInfo = {
          serverId: forward.serverId,
          localHost: forward.localHost,
          localPort: forward.localPort,
          remoteHost: forward.remoteHost,
          remotePort: forward.remotePort,
          activeConnections: forward.activeSockets.size,
        };

        forwardRegistry.remove(bindHost, localPort);

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
