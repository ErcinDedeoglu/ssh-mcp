import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
export declare function registerExecuteTool(server: McpServer, config: Config, pool: ConnectionPool, forwardRegistry: ForwardRegistry, shellRegistry: ShellRegistry): void;
//# sourceMappingURL=execute.d.ts.map