import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { closeForward } from '../actions/close-forward.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export function registerCloseForwardTool(
  server: McpServer,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'close_forward',
    'Close an active port forward. Stops the local listener and closes all tunneled connections.',
    {
      localPort: z
        .number()
        .int()
        .positive()
        .max(65535, 'Port must be at most 65535')
        .describe('Local port of the forward to close'),
      localHost: z
        .string()
        .min(1, 'Local host cannot be empty')
        .optional()
        .describe('Local interface the forward is bound to (default: "127.0.0.1")'),
    },
    async (input: { localPort: number; localHost?: string }) => {
      const outcome = await closeForward(input, partialDeps({ forwardRegistry }));
      return toMcpResponse(outcome);
    },
  );
}
