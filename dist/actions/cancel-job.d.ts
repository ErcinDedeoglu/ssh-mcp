import { type ActionDeps, type ActionOutcome } from './types.js';
export interface CancelJobInput {
    jobId: string;
}
export type CancelJobResult = Record<string, unknown>;
export declare function cancelJob(input: CancelJobInput, deps: ActionDeps): Promise<ActionOutcome<CancelJobResult>>;
//# sourceMappingURL=cancel-job.d.ts.map