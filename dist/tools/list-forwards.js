import { z } from 'zod';
import { listForwards } from '../actions/list-forwards.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerListForwardsTool(server, forwardRegistry, remoteForwardRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('list_forwards', 'List all active port forwards (local and remote), optionally filtered by server ID.', {
        serverId: z
            .string()
            .optional()
            .describe('Filter by server ID (optional, lists all if not specified)'),
    }, async (input) => {
        const outcome = await listForwards(input, partialDeps({ forwardRegistry, remoteForwardRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=list-forwards.js.map