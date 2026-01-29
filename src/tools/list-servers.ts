import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { loadConfig } from '../config/loader.js';
import type { ConnectionPool } from '../ssh/pool.js';

export interface ServerInfo {
  id: string;
  host: string;
  port: number;
  username: string;
  description?: string;
  connected: boolean;
}

function refreshConfig(config: Config): void {
  const fresh = loadConfig();
  config.servers.length = 0;
  config.servers.push(...fresh.servers);
  if (fresh.keys) config.keys = fresh.keys;
  if (fresh.defaults) config.defaults = fresh.defaults;
}

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
      refreshConfig(config);
      const servers: ServerInfo[] = config.servers.map((serverConfig) => ({
        id: serverConfig.id,
        host: serverConfig.host,
        port: serverConfig.port,
        username: serverConfig.username,
        description: serverConfig.description,
        connected: pool.has(serverConfig.id),
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(servers, null, 2),
          },
        ],
      };
    },
  );
}
