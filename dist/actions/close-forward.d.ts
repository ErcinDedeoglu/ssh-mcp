import { type ActionDeps, type ActionOutcome } from './types.js';
export interface CloseForwardInput {
    localPort: number;
    localHost?: string;
}
export interface CloseForwardResult {
    status: string;
    serverId: string;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    activeConnections: number;
}
export declare function closeForward(input: CloseForwardInput, deps: ActionDeps): Promise<ActionOutcome<CloseForwardResult>>;
//# sourceMappingURL=close-forward.d.ts.map