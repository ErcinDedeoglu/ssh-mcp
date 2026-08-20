import { z } from 'zod';
import { forwardPort } from '../actions/forward-port.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerForwardPortTool(server, config, pool, forwardRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('forward_port', 'Create a local port forward through an SSH connection. Listens on a local port and forwards connections to a remote host:port through the SSH tunnel. Use this to access remote databases, internal APIs, or services only accessible from the SSH server.', {
        serverId: z
            .string()
            .describe('Unique identifier of the connected SSH server to tunnel through'),
        remoteHost: z
            .string()
            .min(1, 'Remote host cannot be empty')
            .describe('Remote host to forward to (e.g., "localhost", "192.168.1.100", "db.internal")'),
        remotePort: z
            .number()
            .int()
            .positive()
            .max(65535, 'Port must be at most 65535')
            .describe('Remote port to forward to (e.g., 5432 for PostgreSQL, 3306 for MySQL)'),
        localHost: z
            .string()
            .min(1, 'Local host cannot be empty')
            .optional()
            .describe('Local interface to bind to (default: "127.0.0.1")'),
        localPort: z
            .number()
            .int()
            .min(0)
            .max(65535, 'Port must be at most 65535')
            .optional()
            .describe('Local port to listen on (default: 0 for auto-assign, or specify like 15432)'),
    }, async (input) => {
        const outcome = await forwardPort(input, partialDeps({ config, pool, forwardRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=forward-port.js.map