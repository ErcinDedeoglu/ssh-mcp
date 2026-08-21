import { z } from 'zod';
import { forwardRemotePort } from '../actions/forward-remote-port.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerForwardRemotePortTool(server, config, pool, forwardRegistry, remoteForwardRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('forward_remote_port', 'Create a remote port forward to expose a local service on the SSH server. The SSH server listens on a port and forwards incoming connections to a local host:port. Use this to expose local development servers, databases, or APIs to the remote server.', {
        serverId: z.string().describe('Unique identifier of the connected SSH server'),
        localHost: z
            .string()
            .min(1, 'Local host cannot be empty')
            .describe('Local host to forward connections to (e.g., "localhost", "127.0.0.1")'),
        localPort: z
            .number()
            .int()
            .positive()
            .max(65535, 'Port must be at most 65535')
            .describe('Local port to forward connections to (e.g., 3000 for dev server, 5432 for PostgreSQL)'),
        remoteHost: z
            .string()
            .min(1, 'Remote host cannot be empty')
            .optional()
            .describe('Remote interface to bind on SSH server (default: "127.0.0.1")'),
        remotePort: z
            .number()
            .int()
            .min(0)
            .max(65535, 'Port must be at most 65535')
            .optional()
            .describe('Remote port to listen on SSH server (default: 0 for auto-assign)'),
    }, async (input) => {
        const outcome = await forwardRemotePort(input, partialDeps({ config, pool, forwardRegistry, remoteForwardRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=forward-remote-port.js.map