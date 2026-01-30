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

export class JobRegistry {
  private readonly jobs = new Map<string, Job>();
  private jobCounter = 0;

  create(serverId: string, command: string): Job {
    const id = `job_${Date.now().toString(36)}_${(++this.jobCounter).toString(36)}`;
    const job: Job = {
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

  get(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  updateStatus(jobId: string, status: JobStatus): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        job.completedAt = Date.now();
      }
    }
  }

  setResult(jobId: string, result: ShellExecuteResult): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.result = result;
      job.status = 'completed';
      job.completedAt = Date.now();
    }
  }

  setError(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.error = error;
      job.status = 'failed';
      job.completedAt = Date.now();
    }
  }

  appendOutput(jobId: string, chunk: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.output += chunk;
      job.bytesReceived += chunk.length;
      job.lastOutputAt = Date.now();
    }
  }

  remove(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  list(serverId?: string): Job[] {
    const jobs = Array.from(this.jobs.values());
    if (serverId) {
      return jobs.filter((j) => j.serverId === serverId);
    }
    return jobs;
  }

  clear(): void {
    this.jobs.clear();
  }

  get size(): number {
    return this.jobs.size;
  }
}
