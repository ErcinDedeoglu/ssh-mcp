import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
export declare function registerForwardRemotePortTool(server: McpServer, config: Config, pool: ConnectionPool, forwardRegistry: ForwardRegistry, remoteForwardRegistry: RemoteForwardRegistry): void;
//# sourceMappingURL=forward-remote-port.d.ts.map