import { listServers } from '../actions/list-servers.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerListServersTool(server, config, pool) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('list_servers', 'List all configured SSH servers with their connection status (auto-reloads config)', async () => {
        const outcome = await listServers(partialDeps({ config, pool }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=list-servers.js.map