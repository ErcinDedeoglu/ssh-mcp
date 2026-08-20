import * as process from 'node:process';
import { failureFrom } from './types.js';
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];
export async function cancelJob(input, deps) {
    try {
        const inMemory = deps.jobRegistry.get(input.jobId);
        if (inMemory) {
            return cancelInMemoryJob(input.jobId, deps);
        }
        if (deps.jobStore) {
            const meta = deps.jobStore.read(input.jobId);
            if (meta) {
                return cancelStoredJob(meta, deps);
            }
        }
        return {
            ok: false,
            message: `Job ${input.jobId} not found`,
            json: { error: 'job_not_found', message: `Job ${input.jobId} not found` },
        };
    }
    catch (error) {
        return failureFrom(error);
    }
}
function cancelInMemoryJob(jobId, deps) {
    const job = deps.jobRegistry.get(jobId);
    if (TERMINAL_STATUSES.includes(job.status)) {
        return {
            ok: true,
            data: { jobId: job.id, status: job.status, message: `Job already ${job.status}` },
        };
    }
    let interruptSent = false;
    const shell = deps.shellRegistry.get(job.serverId);
    if (shell?.hasRunningCommand) {
        interruptSent = shell.cancelCurrentCommand();
    }
    const jobToUpdate = deps.jobRegistry.get(jobId);
    jobToUpdate.status = 'cancelled';
    jobToUpdate.error = 'Job cancelled by user';
    jobToUpdate.completedAt = Date.now();
    return {
        ok: true,
        data: {
            jobId: job.id,
            status: 'cancelled',
            interruptSent,
            message: interruptSent
                ? 'Job cancelled and SIGINT sent to remote process.'
                : 'Job marked as cancelled.',
        },
    };
}
function cancelStoredJob(meta, deps) {
    if (TERMINAL_STATUSES.includes(meta.status)) {
        return {
            ok: true,
            data: { jobId: meta.id, status: meta.status, message: `Job already ${meta.status}` },
        };
    }
    let signalSent = false;
    if (meta.pid && isPidAlive(meta.pid)) {
        try {
            process.kill(meta.pid, 'SIGTERM');
            signalSent = true;
        }
        catch {
            // Runner already gone - fall through to mark on disk
        }
    }
    deps.jobStore.save({
        ...meta,
        status: 'cancelled',
        error: 'Job cancelled by user',
        completedAt: Date.now(),
    });
    return {
        ok: true,
        data: {
            jobId: meta.id,
            status: 'cancelled',
            interruptSent: signalSent,
            message: signalSent
                ? 'Job cancelled and SIGTERM sent to runner process.'
                : 'Job marked as cancelled.',
        },
    };
}
function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
//# sourceMappingURL=cancel-job.js.map