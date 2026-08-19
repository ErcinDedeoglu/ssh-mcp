import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { getConsoleHistory } from '../actions/get-console-history.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export function registerGetConsoleHistoryTool(
  server: McpServer,
  shellRegistry: ShellRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'get_console_history',
    'Get command execution history for a server shell session. Returns recent commands with their outputs, exit codes, and timestamps. NOTE: This is a read-only query and does NOT reset the idle timer.',
    {
      serverId: z.string().describe('Unique identifier of the server'),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of history entries to return (default: all, max stored: 100)'),
    },
    async (input: { serverId: string; limit?: number }) => {
      const outcome = await getConsoleHistory(input, partialDeps({ shellRegistry }));
      return toMcpResponse(outcome);
    },
  );
}
