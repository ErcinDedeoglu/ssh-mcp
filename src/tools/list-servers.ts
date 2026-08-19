import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import type { ConnectionPool } from '../ssh/pool.js';
import { listServers } from '../actions/list-servers.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export type { ServerInfo } from '../actions/list-servers.js';

export function registerListServersTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'list_servers',
    'List all configured SSH servers with their connection status (auto-reloads config)',
    async () => {
      const outcome = await listServers(partialDeps({ config, pool }));
      return toMcpResponse(outcome);
    },
  );
}
