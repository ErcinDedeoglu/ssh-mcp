import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { closeRemoteForwardAction } from '../actions/close-remote-forward.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export function registerCloseRemoteForwardTool(
  server: McpServer,
  pool: ConnectionPool,
  remoteForwardRegistry: RemoteForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'close_remote_forward',
    'Close an active remote port forward. Stops the SSH server listener and closes all tunneled connections.',
    {
      serverId: z.string().describe('Server ID of the SSH connection'),
      remotePort: z
        .number()
        .int()
        .positive()
        .max(65535, 'Port must be at most 65535')
        .describe('Remote port of the forward to close'),
      remoteHost: z
        .string()
        .min(1, 'Remote host cannot be empty')
        .optional()
        .describe('Remote interface the forward is bound to (default: "127.0.0.1")'),
    },
    async (input: { serverId: string; remotePort: number; remoteHost?: string }) => {
      const outcome = await closeRemoteForwardAction(
        input,
        partialDeps({ pool, remoteForwardRegistry }),
      );
      return toMcpResponse(outcome);
    },
  );
}
