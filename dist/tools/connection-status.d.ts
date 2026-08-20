import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
export { formatDuration } from '../actions/connection-status.js';
export type { ConnectionHealthStatus } from '../actions/connection-status.js';
export declare function registerConnectionStatusTool(server: McpServer, config: Config, pool: ConnectionPool, forwardRegistry: ForwardRegistry): void;
//# sourceMappingURL=connection-status.d.ts.map