import { type ActionDeps, type ActionOutcome } from './types.js';
export interface CheckJobInput {
    jobId: string;
    maxOutputLength?: number;
}
export type CheckJobResult = Record<string, unknown>;
export declare function checkJob(input: CheckJobInput, deps: ActionDeps): Promise<ActionOutcome<CheckJobResult>>;
//# sourceMappingURL=check-job.d.ts.map