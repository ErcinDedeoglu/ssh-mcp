import { z } from 'zod';
import { getConsoleHistory } from '../actions/get-console-history.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerGetConsoleHistoryTool(server, shellRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('get_console_history', 'Get command execution history for a server shell session. Returns recent commands with their outputs, exit codes, and timestamps. NOTE: This is a read-only query and does NOT reset the idle timer.', {
        serverId: z.string().describe('Unique identifier of the server'),
        limit: z
            .number()
            .optional()
            .describe('Maximum number of history entries to return (default: all, max stored: 100)'),
    }, async (input) => {
        const outcome = await getConsoleHistory(input, partialDeps({ shellRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=get-console-history.js.map