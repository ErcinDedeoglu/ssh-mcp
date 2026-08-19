import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { jumpConnect } from '../actions/jump-connect.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

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
    async (input: { jumpServerId: string; targetServerId: string }) => {
      const outcome = await jumpConnect(
        input,
        partialDeps({ config, pool, forwardRegistry, remoteForwardRegistry }),
      );
      return toMcpResponse(outcome);
    },
  );
}
