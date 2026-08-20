import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import type { ConnectionPool } from '../ssh/pool.js';
export type { ServerInfo } from '../actions/list-servers.js';
export declare function registerListServersTool(server: McpServer, config: Config, pool: ConnectionPool): void;
//# sourceMappingURL=list-servers.d.ts.map