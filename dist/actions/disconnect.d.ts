import { type ActionDeps, type ActionOutcome } from './types.js';
export interface DisconnectInput {
    serverId: string;
}
export interface DisconnectResult {
    status: string;
    serverId: string;
    message: string;
    shellHistoryCleared: boolean;
}
export declare function disconnectServer(input: DisconnectInput, deps: ActionDeps): Promise<ActionOutcome<DisconnectResult>>;
//# sourceMappingURL=disconnect.d.ts.map