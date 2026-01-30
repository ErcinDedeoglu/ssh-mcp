import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';

import { registerListServersTool } from './list-servers.js';
import { registerDisconnectTool } from './disconnect.js';
import { registerExecuteTool } from './execute.js';
import { registerUploadTool } from './upload.js';
import { registerDownloadTool } from './download.js';
import { registerConnectionStatusTool } from './connection-status.js';
import { registerForwardPortTool } from './forward-port.js';
import { registerCloseForwardTool } from './close-forward.js';
import { registerListForwardsTool } from './list-forwards.js';
import { registerForwardRemotePortTool } from './forward-remote-port.js';
import { registerCloseRemoteForwardTool } from './close-remote-forward.js';
import { registerJumpConnectTool } from './jump-connect.js';
import { registerGetConsoleHistoryTool } from './get-console-history.js';

export { sanitizeError, sanitizePath } from './utils.js';

export function registerAllTools(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
  remoteForwardRegistry: RemoteForwardRegistry,
  shellRegistry: ShellRegistry,
): void {
  registerListServersTool(server, config, pool);
  registerDisconnectTool(server, pool, shellRegistry);
  registerExecuteTool(server, config, pool, forwardRegistry, shellRegistry);
  registerUploadTool(server, config, pool, forwardRegistry);
  registerDownloadTool(server, config, pool, forwardRegistry);
  registerConnectionStatusTool(server, config, pool, forwardRegistry);
  registerForwardPortTool(server, config, pool, forwardRegistry);
  registerCloseForwardTool(server, forwardRegistry);
  registerListForwardsTool(server, forwardRegistry, remoteForwardRegistry);
  registerForwardRemotePortTool(server, config, pool, forwardRegistry, remoteForwardRegistry);
  registerCloseRemoteForwardTool(server, pool, remoteForwardRegistry);
  registerJumpConnectTool(server, config, pool, forwardRegistry, remoteForwardRegistry);
  registerGetConsoleHistoryTool(server, shellRegistry);
}

export {
  registerListServersTool,
  registerDisconnectTool,
  registerExecuteTool,
  registerUploadTool,
  registerDownloadTool,
  registerConnectionStatusTool,
  registerForwardPortTool,
  registerCloseForwardTool,
  registerListForwardsTool,
  registerForwardRemotePortTool,
  registerCloseRemoteForwardTool,
  registerJumpConnectTool,
  registerGetConsoleHistoryTool,
};
