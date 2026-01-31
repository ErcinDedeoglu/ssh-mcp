import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { ShellSession } from '../ssh/shell-session.js';
import { ensureConnected, formatConnectionError } from './ensure-connected.js';
import { sanitizeError, truncateOutput, DEFAULT_MAX_OUTPUT_LENGTH } from './utils.js';

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
    'Execute a shell command on a connected SSH server. State (cwd, env vars) persists across calls. ' +
      'IMPORTANT: For long-running commands (apt, npm install, builds) that may not produce output for extended periods, ' +
      'pass stallTimeout=0 to disable stall detection. Default stall timeout is 10s. ' +
      'For very long commands (>5min), use execute_background instead. ' +
      'Timeout priority: timeout param > server config > global defaults > 60s. ' +
      'Output is truncated to maxOutputLength (default: 10000 chars) to prevent overwhelming the client. ' +
      'Response includes truncated=true when output was truncated.',
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
      maxOutputLength: z
        .number()
        .optional()
        .describe(
          'Maximum output length in chars before truncation. ' +
            'Default: 10000. Prevents large outputs from overwhelming the client.',
        ),
      agentForward: z
        .boolean()
        .optional()
        .describe(
          'Enable SSH agent forwarding for this shell session. ' +
            'Allows using local SSH keys on remote server (e.g., for git operations). ' +
            'If true and existing shell lacks forwarding, shell is auto-recreated (cwd/env state lost).',
        ),
    },
    async ({
      serverId,
      command,
      stdin,
      timeout,
      stallTimeout,
      maxOutputLength,
      agentForward,
    }: {
      serverId: string;
      command: string;
      stdin?: string;
      timeout?: number;
      stallTimeout?: number | null;
      maxOutputLength?: number;
      agentForward?: boolean;
    }) => {
      try {
        const connectionResult = await ensureConnected(serverId, { config, pool, forwardRegistry });
        if (!connectionResult.success) {
          return formatConnectionError(connectionResult.errorInfo);
        }

        const { session, serverConfig } = connectionResult;

        const configAllowsAgentForward = serverConfig.agentForward ?? true;
        const effectiveAgentForward = configAllowsAgentForward && (agentForward ?? false);
        const { shell, recreated } = await getOrCreateShell(
          serverId,
          session.client,
          shellRegistry,
          {
            agentForward: effectiveAgentForward,
          },
        );
        const timeoutMs = resolveTimeoutMs(timeout, serverConfig, config);
        const stallTimeoutMs = resolveStallTimeoutMs(stallTimeout);

        const result = await shell.execute(command, { timeoutMs, stallTimeoutMs, stdin });
        session.touch();

        const effectiveMaxOutputLength = maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;
        const { text: stdout, truncated } = truncateOutput(result.stdout, effectiveMaxOutputLength);

        const response: Record<string, unknown> = {
          serverId,
          command,
          stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          truncated,
        };
        if (recreated) {
          response.notice =
            'Shell recreated with agent forwarding enabled (previous cwd/env state lost)';
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
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

interface GetOrCreateShellOptions {
  agentForward?: boolean;
}

interface GetOrCreateShellResult {
  shell: ShellSession;
  recreated: boolean;
}

async function getOrCreateShell(
  serverId: string,
  client: Parameters<ShellSession['initialize']>[0],
  registry: ShellRegistry,
  options: GetOrCreateShellOptions = {},
): Promise<GetOrCreateShellResult> {
  const requestedAgentForward = options.agentForward ?? false;
  let shell = registry.get(serverId);
  let recreated = false;

  // If shell exists but agentForward mismatch (requested true, has false), recreate
  if (shell?.isReady && requestedAgentForward && !shell.hasAgentForward) {
    registry.remove(serverId);
    shell = undefined;
    recreated = true;
  }

  if (shell?.isReady) return { shell, recreated };

  shell = new ShellSession({ agentForward: requestedAgentForward });
  await shell.initialize(client);
  registry.set(serverId, shell);
  return { shell, recreated };
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
