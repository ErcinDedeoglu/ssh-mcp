import { type ActionDeps, type ActionOutcome } from './types.js';
export interface CloseRemoteForwardInput {
    serverId: string;
    remotePort: number;
    remoteHost?: string;
}
export interface CloseRemoteForwardResult {
    status: string;
    serverId: string;
    remoteHost: string;
    remotePort: number;
    localHost: string;
    localPort: number;
    activeConnections: number;
}
export declare function closeRemoteForwardAction(input: CloseRemoteForwardInput, deps: ActionDeps): Promise<ActionOutcome<CloseRemoteForwardResult>>;
//# sourceMappingURL=close-remote-forward.d.ts.map