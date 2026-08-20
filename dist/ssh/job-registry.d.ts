import type { ShellExecuteResult } from './shell-session.types.js';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface Job {
    id: string;
    serverId: string;
    command: string;
    status: JobStatus;
    startedAt: number;
    completedAt?: number;
    result?: ShellExecuteResult;
    error?: string;
    output: string;
    bytesReceived: number;
    lastOutputAt?: number;
}
export declare class JobRegistry {
    private readonly jobs;
    private jobCounter;
    create(serverId: string, command: string): Job;
    get(jobId: string): Job | undefined;
    updateStatus(jobId: string, status: JobStatus): void;
    setResult(jobId: string, result: ShellExecuteResult): void;
    setError(jobId: string, error: string): void;
    appendOutput(jobId: string, chunk: string): void;
    remove(jobId: string): boolean;
    list(serverId?: string): Job[];
    clear(): void;
    get size(): number;
}
//# sourceMappingURL=job-registry.d.ts.map