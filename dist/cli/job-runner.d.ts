export interface RunJobOptions {
    timeout?: number;
    stallTimeout?: number | null;
    config?: string;
}
/**
 * Detached child entry point: executes one command, streams output to the
 * JobStore, records the terminal state, and exits. Owned by `exec --bg`.
 */
export declare function runJob(jobId: string, serverId: string, command: string, options?: RunJobOptions): Promise<number>;
//# sourceMappingURL=job-runner.d.ts.map