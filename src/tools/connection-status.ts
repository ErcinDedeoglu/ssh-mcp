import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { ensureConnected, formatConnectionError } from './ensure-connected.js';
import { sanitizeError } from './utils.js';

export interface ConnectionHealthStatus {
  serverId: string;
  connected: boolean;
  idle: boolean;
  reconnecting: boolean;
  reconnectAttempt?: number;
  lastActivityMs: number;
  lastActivityAgo: string;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export function registerConnectionStatusTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'connection_status',
    'Check the health and status of an SSH connection. Auto-connects if not already connected.',
    { serverId: z.string().describe('Unique identifier of the server to check connection health') },
    async ({ serverId }: { serverId: string }) => {
      try {
        const connectionResult = await ensureConnected(serverId, { config, pool, forwardRegistry });
        if (!connectionResult.success) {
          return formatConnectionError(connectionResult.errorInfo);
        }

        const { session } = connectionResult;

        const health = session.healthCheck();
        const now = Date.now();
        const lastActivityAgo =
          health.lastActivity > 0 ? formatDuration(now - health.lastActivity) : 'never';

        const status: ConnectionHealthStatus = {
          serverId,
          connected: health.connected,
          idle: health.idle,
          reconnecting: health.reconnecting,
          lastActivityMs: health.lastActivity,
          lastActivityAgo,
        };

        if (health.reconnectAttempt !== undefined) {
          status.reconnectAttempt = health.reconnectAttempt;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(status),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: sanitizeError(error),
            },
          ],
        };
      }
    },
  );
}
