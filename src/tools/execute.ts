import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { executeCommand } from '../actions/execute.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

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
    async (input: {
      serverId: string;
      command: string;
      stdin?: string;
      timeout?: number;
      stallTimeout?: number | null;
      maxOutputLength?: number;
      agentForward?: boolean;
    }) => {
      const outcome = await executeCommand(
        input,
        partialDeps({ config, pool, forwardRegistry, shellRegistry }),
      );
      return toMcpResponse(outcome);
    },
  );
}
