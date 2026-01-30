import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { ShellSession } from '../ssh/shell-session.js';
import { ensureConnected, formatConnectionError } from './ensure-connected.js';
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
  forwardRegistry: ForwardRegistry,
  shellRegistry: ShellRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'execute',
    'Execute a shell command on a connected SSH server. State (cwd, env vars) persists across calls. Timeout priority: timeout param > server config > global defaults > 60s.',
    {
      serverId: z.string().describe('Unique identifier of the server to execute command on'),
      command: z.string().describe('Shell command to execute on the remote server'),
      stdin: z
        .string()
        .optional()
        .describe(
          'Content to write to the command stdin. Use for commands that read from stdin ' +
            'like "cat > file", "bash -s", or piped commands. Content is sent followed by EOF.',
        ),
      timeout: z
        .number()
        .optional()
        .describe('Command timeout in seconds (overrides server config)'),
      stallTimeout: z
        .number()
        .nullable()
        .optional()
        .describe(
          'Stall timeout in seconds - max time without output before failing. ' +
            'Default: 10s. Set to 0 or null to disable for long-running commands.',
        ),
    },
    async ({
      serverId,
      command,
      stdin,
      timeout,
      stallTimeout,
    }: {
      serverId: string;
      command: string;
      stdin?: string;
      timeout?: number;
      stallTimeout?: number | null;
    }) => {
      try {
        const connectionResult = await ensureConnected(serverId, { config, pool, forwardRegistry });
        if (!connectionResult.success) {
          return formatConnectionError(connectionResult.errorInfo);
        }

        const { session, serverConfig } = connectionResult;

        const shell = await getOrCreateShell(serverId, session.client, shellRegistry);
        const timeoutMs = resolveTimeoutMs(timeout, serverConfig, config);
        const stallTimeoutMs = resolveStallTimeoutMs(stallTimeout);

        const result = await shell.execute(command, { timeoutMs, stallTimeoutMs, stdin });
        session.touch();

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

function resolveStallTimeoutMs(stallTimeout: number | null | undefined): number | null {
  if (stallTimeout === null || stallTimeout === 0) return null;
  if (stallTimeout === undefined) return undefined as unknown as null;
  return stallTimeout * MS_PER_SECOND;
}
