import { type ActionDeps, type ActionOutcome } from './types.js';
export interface ListForwardsInput {
    serverId?: string;
}
export interface ListForwardsResult {
    count: number;
    localCount: number;
    remoteCount: number;
    forwards: Array<Record<string, unknown>>;
}
export declare function listForwards(input: ListForwardsInput, deps: ActionDeps): Promise<ActionOutcome<ListForwardsResult>>;
//# sourceMappingURL=list-forwards.d.ts.map