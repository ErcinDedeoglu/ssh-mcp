import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { JobRegistry } from '../ssh/job-registry.js';
export declare function registerExecuteBackgroundTool(server: McpServer, config: Config, pool: ConnectionPool, forwardRegistry: ForwardRegistry, shellRegistry: ShellRegistry, jobRegistry: JobRegistry): void;
//# sourceMappingURL=execute-background.d.ts.map