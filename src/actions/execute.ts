import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { getOrCreateShell, resolveTimeoutMs, resolveStallTimeoutMs } from './shell-helpers.js';
import { failureFrom, type ActionDeps, type ActionOutcome } from './types.js';
import { DEFAULT_MAX_OUTPUT_LENGTH, truncateOutput } from '../utils/sanitize.js';

export interface ExecuteInput {
  serverId: string;
  command: string;
  stdin?: string;
  timeout?: number;
  stallTimeout?: number | null;
  maxOutputLength?: number;
  agentForward?: boolean;
}

export interface ExecuteResult {
  serverId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
  notice?: string;
}

export async function executeCommand(
  input: ExecuteInput,
  deps: ActionDeps,
): Promise<ActionOutcome<ExecuteResult>> {
  try {
    const { serverId, command, stdin, timeout, stallTimeout, maxOutputLength, agentForward } =
      input;

    const connectionResult = await ensureConnected(serverId, {
      config: deps.config,
      pool: deps.pool,
      forwardRegistry: deps.forwardRegistry,
    });
    if (!connectionResult.success) {
      return connectionFailure(connectionResult.errorInfo);
    }

    const { session, serverConfig } = connectionResult;

    const configAllowsAgentForward = serverConfig.agentForward ?? true;
    const effectiveAgentForward = configAllowsAgentForward && (agentForward ?? false);
    const { shell, recreated } = await getOrCreateShell(
      serverId,
      session.client,
      deps.shellRegistry,
      {
        agentForward: effectiveAgentForward,
        shellType: serverConfig.shell,
        serverConfig,
      },
    );
    const timeoutMs = resolveTimeoutMs(timeout, serverConfig, deps.config);
    const stallTimeoutMs = resolveStallTimeoutMs(stallTimeout);

    const result = await shell.execute(command, { timeoutMs, stallTimeoutMs, stdin });
    session.touch();

    const effectiveMaxOutputLength = maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;
    const { text: stdout, truncated } = truncateOutput(result.stdout, effectiveMaxOutputLength);

    const data: ExecuteResult = {
      serverId,
      command,
      stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      truncated,
    };
    if (recreated) {
      data.notice = 'Shell recreated with agent forwarding enabled (previous cwd/env state lost)';
    }

    return { ok: true, data };
  } catch (error) {
    return failureFrom(error);
  }
}
