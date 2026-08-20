export interface LaunchJobOptions {
    timeout?: number;
    stallTimeout?: number | null;
}
/**
 * Spawns a detached runner process that owns the job for its lifetime.
 * Initial metadata is persisted immediately so `job check` works right away.
 */
export declare function launchBackgroundJob(serverId: string, command: string, options?: LaunchJobOptions): {
    jobId: string;
};
//# sourceMappingURL=job-launch.d.ts.map