import type { JobStatus, Job } from './job-registry.js';
/**
 * Disk-backed job persistence for CLI background jobs.
 * Metadata lives in <jobsDir>/<jobId>.json, streamed output in <jobId>.output.
 * Jobs survive across CLI invocations; the runner process owns writes.
 */
export interface JobMeta {
    id: string;
    serverId: string;
    command: string;
    status: JobStatus;
    startedAt: number;
    completedAt?: number;
    error?: string;
    result?: Job['result'];
    /** PID of the runner process executing this job. */
    pid?: number;
}
export declare class JobStore {
    private readonly dir;
    constructor(dir?: string);
    get jobsDir(): string;
    newId(): string;
    save(meta: JobMeta): void;
    read(jobId: string): JobMeta | undefined;
    appendOutput(jobId: string, chunk: string): void;
    readOutput(jobId: string): string;
    outputMtime(jobId: string): number | undefined;
    list(): JobMeta[];
    remove(jobId: string): void;
    /** Drops terminal jobs older than 24h and enforces the tracking cap. */
    prune(): void;
    private ensureDir;
    private metaPath;
    private outputPath;
}
//# sourceMappingURL=job-store.d.ts.map