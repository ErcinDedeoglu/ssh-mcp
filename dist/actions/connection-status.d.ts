import { type ActionDeps, type ActionOutcome } from './types.js';
export interface ConnectionStatusInput {
    serverId: string;
}
export interface ConnectionHealthStatus {
    serverId: string;
    connected: boolean;
    idle: boolean;
    idleWarning?: string;
    reconnecting: boolean;
    reconnectAttempt?: number;
    lastActivityMs: number;
    lastActivityAgo: string;
}
export declare function formatDuration(ms: number): string;
export declare function connectionStatus(input: ConnectionStatusInput, deps: ActionDeps): Promise<ActionOutcome<ConnectionHealthStatus>>;
//# sourceMappingURL=connection-status.d.ts.map