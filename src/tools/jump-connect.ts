import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { loadConfig } from '../config/loader.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { SessionKeeper } from '../ssh/session.js';
import { createJumpStream } from '../ssh/jump-stream.js';
import { ensureConnected, formatConnectionError } from './ensure-connected.js';
import { sanitizeError } from './utils.js';

function refreshConfig(config: Config): void {
  const fresh = loadConfig();
  config.servers.length = 0;
  config.servers.push(...fresh.servers);
  if (fresh.keys) config.keys = fresh.keys;
  if (fresh.defaults) config.defaults = fresh.defaults;
}

const JUMP_CONNECTION_NO_RECONNECT = 0;

export function registerJumpConnectTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
  remoteForwardRegistry: RemoteForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'jump_connect',
    'Connect to a server through a jump host (bastion). Auto-connects to jump host if needed. Auto-reloads config. NOTE: Jump connections do NOT auto-reconnect - if the connection drops, you must call jump_connect again.',
    {
      jumpServerId: z.string().describe('Server ID of the jump host (bastion)'),
      targetServerId: z.string().describe('Server ID of the target server to connect to'),
    },
    async ({ jumpServerId, targetServerId }: { jumpServerId: string; targetServerId: string }) => {
      try {
        refreshConfig(config);

        if (pool.has(targetServerId)) {
          const existing = pool.get(targetServerId);
          if (existing?.isConnected) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'already_connected',
                    targetServerId,
                    message: `Already connected to ${targetServerId}`,
                  }),
                },
              ],
            };
          }
        }

        const jumpResult = await ensureConnected(jumpServerId, { config, pool, forwardRegistry });
        if (!jumpResult.success) {
          return formatConnectionError(jumpResult.errorInfo);
        }

        const jumpSession = jumpResult.session;

        const targetConfig = config.servers.find((s) => s.id === targetServerId);
        if (!targetConfig) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'server_not_found',
                  serverId: targetServerId,
                  reason: `Target server '${targetServerId}' not found in configuration`,
                }),
              },
            ],
          };
        }

        const jumpStream = await createJumpStream(
          jumpSession,
          targetConfig.host,
          targetConfig.port,
        );

        const sessionOptions = {
          idleTimeoutMs:
            (targetConfig.timeouts?.idle ?? config.defaults?.timeouts?.idle ?? 900) * 1000,
          maxReconnectAttempts: JUMP_CONNECTION_NO_RECONNECT,
          jumpStream,
          keys: config.keys,
        };

        const targetSession = new SessionKeeper(targetConfig, sessionOptions);
        targetSession.on('disconnected', () => {
          forwardRegistry.removeByServer(targetServerId);
          remoteForwardRegistry.removeByServer(targetServerId);
        });
        await targetSession.connect();
        pool.add(targetSession);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'connected',
                targetServerId,
                jumpServerId,
                host: targetConfig.host,
                port: targetConfig.port,
                username: targetConfig.username,
                isJumpConnection: true,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: sanitizeError(error) }],
        };
      }
    },
  );
}
