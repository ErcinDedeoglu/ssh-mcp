import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';

import { registerListServersTool } from './list-servers.js';
import { registerConnectTool } from './connect.js';
import { registerDisconnectTool } from './disconnect.js';
import { registerExecuteTool } from './execute.js';
import { registerUploadTool } from './upload.js';
import { registerDownloadTool } from './download.js';
import { registerConnectionStatusTool } from './connection-status.js';

export { sanitizeError, sanitizePath } from './utils.js';

export function registerAllTools(
  server: McpServer,
  config: Config,
  pool: ConnectionPool
): void {
  registerListServersTool(server, config, pool);
  registerConnectTool(server, config, pool);
  registerDisconnectTool(server, pool);
  registerExecuteTool(server, config, pool);
  registerUploadTool(server, pool);
  registerDownloadTool(server, pool);
  registerConnectionStatusTool(server, pool);
}

export {
  registerListServersTool,
  registerConnectTool,
  registerDisconnectTool,
  registerExecuteTool,
  registerUploadTool,
  registerDownloadTool,
  registerConnectionStatusTool,
};
