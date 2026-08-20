import { z } from 'zod';
import { connectionStatus } from '../actions/connection-status.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export { formatDuration } from '../actions/connection-status.js';
export function registerConnectionStatusTool(server, config, pool, forwardRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('connection_status', 'Check the health and status of an SSH connection. Auto-connects if not already connected. NOTE: This is a read-only check and does NOT reset the idle timer.', { serverId: z.string().describe('Unique identifier of the server to check connection health') }, async (input) => {
        const outcome = await connectionStatus(input, partialDeps({ config, pool, forwardRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=connection-status.js.map