import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { listForwards } from '../actions/list-forwards.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

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
    async (input: { serverId?: string }) => {
      const outcome = await listForwards(
        input,
        partialDeps({ forwardRegistry, remoteForwardRegistry }),
      );
      return toMcpResponse(outcome);
    },
  );
}
