import { type ActionDeps, type ActionOutcome } from './types.js';
export interface JumpConnectInput {
    jumpServerId: string;
    targetServerId: string;
}
export interface JumpConnectResult {
    status: string;
    targetServerId: string;
    jumpServerId?: string;
    host?: string;
    port?: number;
    username?: string;
    isJumpConnection?: boolean;
    message?: string;
}
export declare function jumpConnect(input: JumpConnectInput, deps: ActionDeps): Promise<ActionOutcome<JumpConnectResult>>;
//# sourceMappingURL=jump-connect.d.ts.map