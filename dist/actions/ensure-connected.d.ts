import type { Config, ServerConfig } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { SessionKeeper } from '../ssh/session.js';
import type { ActionOutcome } from './types.js';
export interface ConnectionErrorInfo {
    error: 'server_not_found' | 'connection_failed';
    serverId: string;
    host?: string;
    port?: number;
    username?: string;
    reason?: string;
}
export interface EnsureConnectedSuccess {
    success: true;
    session: SessionKeeper;
    serverConfig: ServerConfig;
}
export interface EnsureConnectedFailure {
    success: false;
    errorInfo: ConnectionErrorInfo;
}
export type EnsureConnectedResult = EnsureConnectedSuccess | EnsureConnectedFailure;
export interface EnsureConnectedDeps {
    config: Config;
    pool: ConnectionPool;
    forwardRegistry: ForwardRegistry;
    remoteForwardRegistry?: RemoteForwardRegistry;
}
export declare function refreshConfig(config: Config): void;
export declare function ensureConnected(serverId: string, deps: EnsureConnectedDeps): Promise<EnsureConnectedResult>;
/** Maps a connection failure to the structured ActionOutcome used by both frontends. */
export declare function connectionFailure(errorInfo: ConnectionErrorInfo): ActionOutcome<never>;
//# sourceMappingURL=ensure-connected.d.ts.map