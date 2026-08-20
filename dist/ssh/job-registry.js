export class JobRegistry {
    jobs = new Map();
    jobCounter = 0;
    create(serverId, command) {
        const id = `job_${Date.now().toString(36)}_${(++this.jobCounter).toString(36)}`;
        const job = {
            id,
            serverId,
            command,
            status: 'pending',
            startedAt: Date.now(),
            output: '',
            bytesReceived: 0,
        };
        this.jobs.set(id, job);
        return job;
    }
    get(jobId) {
        return this.jobs.get(jobId);
    }
    updateStatus(jobId, status) {
        const job = this.jobs.get(jobId);
        if (job) {
            job.status = status;
            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                job.completedAt = Date.now();
            }
        }
    }
    setResult(jobId, result) {
        const job = this.jobs.get(jobId);
        if (job) {
            job.result = result;
            job.status = 'completed';
            job.completedAt = Date.now();
        }
    }
    setError(jobId, error) {
        const job = this.jobs.get(jobId);
        if (job) {
            job.error = error;
            job.status = 'failed';
            job.completedAt = Date.now();
        }
    }
    appendOutput(jobId, chunk) {
        const job = this.jobs.get(jobId);
        if (job) {
            job.output += chunk;
            job.bytesReceived += chunk.length;
            job.lastOutputAt = Date.now();
        }
    }
    remove(jobId) {
        return this.jobs.delete(jobId);
    }
    list(serverId) {
        const jobs = Array.from(this.jobs.values());
        if (serverId) {
            return jobs.filter((j) => j.serverId === serverId);
        }
        return jobs;
    }
    clear() {
        this.jobs.clear();
    }
    get size() {
        return this.jobs.size;
    }
}
//# sourceMappingURL=job-registry.js.map