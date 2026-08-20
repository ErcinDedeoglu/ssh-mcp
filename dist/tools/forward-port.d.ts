import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
export declare function registerForwardPortTool(server: McpServer, config: Config, pool: ConnectionPool, forwardRegistry: ForwardRegistry): void;
//# sourceMappingURL=forward-port.d.ts.map