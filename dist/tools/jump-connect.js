import { z } from 'zod';
import { jumpConnect } from '../actions/jump-connect.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerJumpConnectTool(server, config, pool, forwardRegistry, remoteForwardRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('jump_connect', 'Connect to a server through a jump host (bastion). Auto-connects to jump host if needed. Auto-reloads config. NOTE: Jump connections do NOT auto-reconnect - if the connection drops, you must call jump_connect again.', {
        jumpServerId: z.string().describe('Server ID of the jump host (bastion)'),
        targetServerId: z.string().describe('Server ID of the target server to connect to'),
    }, async (input) => {
        const outcome = await jumpConnect(input, partialDeps({ config, pool, forwardRegistry, remoteForwardRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=jump-connect.js.map