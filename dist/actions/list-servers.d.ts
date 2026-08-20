import type { ActionDeps, ActionOutcome } from './types.js';
export interface ServerInfo {
    id: string;
    host: string;
    port: number;
    username: string;
    description?: string;
    connected: boolean;
}
export declare function listServers(deps: ActionDeps): Promise<ActionOutcome<ServerInfo[]>>;
//# sourceMappingURL=list-servers.d.ts.map