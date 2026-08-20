import { z } from 'zod';
import { disconnectServer } from '../actions/disconnect.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerDisconnectTool(server, pool, shellRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('disconnect', 'Close an SSH connection to a server. WARNING: Shell history (up to 100 commands) will be permanently deleted.', { serverId: z.string().describe('Unique identifier of the server to disconnect from') }, async (input) => {
        const outcome = await disconnectServer(input, partialDeps({ pool, shellRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=disconnect.js.map