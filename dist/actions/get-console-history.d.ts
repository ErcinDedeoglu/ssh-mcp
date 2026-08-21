import { type ActionDeps, type ActionOutcome } from './types.js';
export interface GetConsoleHistoryInput {
    serverId: string;
    limit?: number;
}
export interface GetConsoleHistoryResult {
    serverId: string;
    count: number;
    history: unknown[];
}
export declare function getConsoleHistory(input: GetConsoleHistoryInput, deps: ActionDeps): Promise<ActionOutcome<GetConsoleHistoryResult>>;
//# sourceMappingURL=get-console-history.d.ts.map