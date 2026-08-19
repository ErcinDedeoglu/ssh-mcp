import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { disconnectServer } from '../actions/disconnect.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export function registerDisconnectTool(
  server: McpServer,
  pool: ConnectionPool,
  shellRegistry: ShellRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'disconnect',
    'Close an SSH connection to a server. WARNING: Shell history (up to 100 commands) will be permanently deleted.',
    { serverId: z.string().describe('Unique identifier of the server to disconnect from') },
    async (input: { serverId: string }) => {
      const outcome = await disconnectServer(input, partialDeps({ pool, shellRegistry }));
      return toMcpResponse(outcome);
    },
  );
}
