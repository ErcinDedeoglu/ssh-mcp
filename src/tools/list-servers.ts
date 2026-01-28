import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import type { ConnectionPool } from '../ssh/pool.js';

export const listServersInputSchema = z.object({}).describe('No input required');

export interface ServerInfo {
  id: string;
  host: string;
  port: number;
  username: string;
  description?: string;
  connected: boolean;
}

export function registerListServersTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool
): void {
  server.tool(
    'list_servers',
    'List all configured SSH servers with their connection status',
    listServersInputSchema.shape,
    async () => {
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
    }
  );
}
