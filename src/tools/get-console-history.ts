import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { sanitizeError } from './utils.js';

export function registerGetConsoleHistoryTool(
  server: McpServer,
  shellRegistry: ShellRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'get_console_history',
    'Get command execution history for a server shell session. Returns recent commands with their outputs, exit codes, and timestamps.',
    {
      serverId: z.string().describe('Unique identifier of the server'),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of history entries to return (default: all, max stored: 100)'),
    },
    async ({ serverId, limit }: { serverId: string; limit?: number }) => {
      try {
        const shell = shellRegistry.get(serverId);
        if (!shell) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `No shell session for server '${serverId}'. Execute a command first.`,
              },
            ],
          };
        }

        const history = shell.getHistory(limit);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ serverId, count: history.length, history }),
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
