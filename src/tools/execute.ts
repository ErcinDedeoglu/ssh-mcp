import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { ShellSession } from '../ssh/shell-session.js';
import { sanitizeError } from './utils.js';

const DEFAULT_COMMAND_TIMEOUT_SECONDS = 60;
const MS_PER_SECOND = 1000;

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function registerExecuteTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  shellRegistry: ShellRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'execute',
    'Execute a shell command on a connected SSH server. State (cwd, env vars) persists across calls.',
    {
      serverId: z.string().describe('Unique identifier of the server to execute command on'),
      command: z.string().describe('Shell command to execute on the remote server'),
      timeout: z
        .number()
        .optional()
        .describe('Command timeout in seconds (overrides server config)'),
    },
    async ({
      serverId,
      command,
      timeout,
    }: {
      serverId: string;
      command: string;
      timeout?: number;
    }) => {
      try {
        const sshSession = pool.get(serverId);
        if (!sshSession) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `No active connection to server '${serverId}'. Use connect tool first.`,
              },
            ],
          };
        }

        if (!sshSession.isConnected) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Connection to '${serverId}' is not active. Reconnect required.`,
              },
            ],
          };
        }

        const shell = await getOrCreateShell(serverId, sshSession.client, shellRegistry);
        const serverConfig = config.servers.find((s) => s.id === serverId);
        const timeoutMs = resolveTimeoutMs(timeout, serverConfig, config);

        const result = await shell.execute(command, timeoutMs);
        sshSession.touch();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ serverId, command, ...result }),
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

async function getOrCreateShell(
  serverId: string,
  client: Parameters<ShellSession['initialize']>[0],
  registry: ShellRegistry,
): Promise<ShellSession> {
  let shell = registry.get(serverId);
  if (shell?.isReady) return shell;

  shell = new ShellSession();
  await shell.initialize(client);
  registry.set(serverId, shell);
  return shell;
}

function resolveTimeoutMs(
  timeout: number | undefined,
  serverConfig: { timeouts?: { command?: number } } | undefined,
  config: Config,
): number {
  const seconds =
    timeout ??
    serverConfig?.timeouts?.command ??
    config.defaults?.timeouts?.command ??
    DEFAULT_COMMAND_TIMEOUT_SECONDS;
  return seconds * MS_PER_SECOND;
}
