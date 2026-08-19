import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { connectionStatus } from '../actions/connection-status.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export { formatDuration } from '../actions/connection-status.js';
export type { ConnectionHealthStatus } from '../actions/connection-status.js';

export function registerConnectionStatusTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'connection_status',
    'Check the health and status of an SSH connection. Auto-connects if not already connected. NOTE: This is a read-only check and does NOT reset the idle timer.',
    { serverId: z.string().describe('Unique identifier of the server to check connection health') },
    async (input: { serverId: string }) => {
      const outcome = await connectionStatus(input, partialDeps({ config, pool, forwardRegistry }));
      return toMcpResponse(outcome);
    },
  );
}
