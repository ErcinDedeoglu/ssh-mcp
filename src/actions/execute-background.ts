import type { ShellSession } from '../ssh/shell-session.js';
import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { getOrCreateShell, resolveTimeoutMs, resolveStallTimeoutMs } from './shell-helpers.js';
import { failureFrom, type ActionDeps, type ActionOutcome } from './types.js';
import { sanitizeError } from '../utils/sanitize.js';

export interface ExecuteBackgroundInput {
  serverId: string;
  command: string;
  timeout?: number;
  stallTimeout?: number | null;
}

export interface ExecuteBackgroundResult {
  jobId: string;
  serverId: string;
  command: string;
  status: string;
  message: string;
}

export async function executeBackground(
  input: ExecuteBackgroundInput,
  deps: ActionDeps,
): Promise<ActionOutcome<ExecuteBackgroundResult>> {
  try {
    const { serverId, command, timeout, stallTimeout } = input;

    const connectionResult = await ensureConnected(serverId, {
      config: deps.config,
      pool: deps.pool,
      forwardRegistry: deps.forwardRegistry,
    });
    if (!connectionResult.success) {
      return connectionFailure(connectionResult.errorInfo);
    }

    const { session, serverConfig } = connectionResult;
    const { shell } = await getOrCreateShell(serverId, session.client, deps.shellRegistry, {
      shellType: serverConfig.shell,
      serverConfig,
    });

    const job = deps.jobRegistry.create(serverId, command);
    deps.jobRegistry.updateStatus(job.id, 'running');

    const timeoutMs = resolveTimeoutMs(timeout, serverConfig, deps.config);
    const stallTimeoutMs = resolveStallTimeoutMs(stallTimeout);

    executeJobAsync(shell, job.id, command, { timeoutMs, stallTimeoutMs }, deps, session);

    return {
      ok: true,
      data: {
        jobId: job.id,
        serverId,
        command,
        status: 'running',
        message: 'Job started. Use check_job to poll for status.',
      },
    };
  } catch (error) {
    return failureFrom(error);
  }
}

function executeJobAsync(
  shell: ShellSession,
  jobId: string,
  command: string,
  options: { timeoutMs: number; stallTimeoutMs: number | null },
  deps: ActionDeps,
  session: { touch: () => void },
): void {
  const onOutput = (chunk: string) => deps.jobRegistry.appendOutput(jobId, chunk);
  shell
    .execute(command, { ...options, onOutput })
    .then((result) => {
      deps.jobRegistry.setResult(jobId, result);
      session.touch();
    })
    .catch((error) => {
      deps.jobRegistry.setError(jobId, sanitizeError(error));
    });
}
