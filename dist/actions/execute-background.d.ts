import { type ActionDeps, type ActionOutcome } from './types.js';
export interface ExecuteBackgroundInput {
    serverId: string;
    command: string;
    timeout?: number;
    stallTimeout?: number | null;
}
export interface ExecuteBackgroundResult {
    jobId: string;
    serverId: string;
    command: string;
    status: string;
    message: string;
}
export declare function executeBackground(input: ExecuteBackgroundInput, deps: ActionDeps): Promise<ActionOutcome<ExecuteBackgroundResult>>;
//# sourceMappingURL=execute-background.d.ts.map