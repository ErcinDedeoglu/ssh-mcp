import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { ShellSession } from '../ssh/shell-session.js';
import { JobRegistry } from '../ssh/job-registry.js';
import { ensureConnected, formatConnectionError } from './ensure-connected.js';
import { sanitizeError } from './utils.js';

const DEFAULT_COMMAND_TIMEOUT_SECONDS = 60;
const MS_PER_SECOND = 1000;

export function registerExecuteBackgroundTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
  shellRegistry: ShellRegistry,
  jobRegistry: JobRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'execute_background',
    'Execute a shell command in the background, returning a job ID immediately. ' +
      'Use check_job to poll for status/output. Ideal for long-running commands.',
    {
      serverId: z.string().describe('Unique identifier of the server to execute command on'),
      command: z.string().describe('Shell command to execute on the remote server'),
      timeout: z
        .number()
        .optional()
        .describe('Command timeout in seconds (overrides server config)'),
      stallTimeout: z
        .number()
        .nullable()
        .optional()
        .describe('Stall timeout in seconds. Set to 0 or null to disable.'),
    },
    async ({
      serverId,
      command,
      timeout,
      stallTimeout,
    }: {
      serverId: string;
      command: string;
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

        const job = jobRegistry.create(serverId, command);
        jobRegistry.updateStatus(job.id, 'running');

        const timeoutMs = resolveTimeoutMs(timeout, serverConfig, config);
        const stallTimeoutMs = resolveStallTimeoutMs(stallTimeout);

        executeJobAsync(
          shell,
          job.id,
          command,
          { timeoutMs, stallTimeoutMs },
          jobRegistry,
          session,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                jobId: job.id,
                serverId,
                command,
                status: 'running',
                message: 'Job started. Use check_job to poll for status.',
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

function executeJobAsync(
  shell: ShellSession,
  jobId: string,
  command: string,
  options: { timeoutMs: number; stallTimeoutMs: number | null },
  jobRegistry: JobRegistry,
  session: { touch: () => void },
): void {
  shell
    .execute(command, options)
    .then((result) => {
      jobRegistry.setResult(jobId, result);
      session.touch();
    })
    .catch((error) => {
      jobRegistry.setError(jobId, sanitizeError(error));
    });
}
