import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getConfigPath } from '../config/path.js';
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_TRACKED_JOBS = 200;

export class JobStore {
  private readonly dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? path.join(path.dirname(getConfigPath()), 'jobs');
  }

  get jobsDir(): string {
    return this.dir;
  }

  newId(): string {
    return `job_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  }

  save(meta: JobMeta): void {
    this.ensureDir();
    const target = this.metaPath(meta.id);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
    fs.renameSync(tmp, target);
  }

  read(jobId: string): JobMeta | undefined {
    try {
      const raw = fs.readFileSync(this.metaPath(jobId), 'utf-8');
      return JSON.parse(raw) as JobMeta;
    } catch {
      return undefined;
    }
  }

  appendOutput(jobId: string, chunk: string): void {
    this.ensureDir();
    fs.appendFileSync(this.outputPath(jobId), chunk);
  }

  readOutput(jobId: string): string {
    try {
      return fs.readFileSync(this.outputPath(jobId), 'utf-8');
    } catch {
      return '';
    }
  }

  outputMtime(jobId: string): number | undefined {
    try {
      return fs.statSync(this.outputPath(jobId)).mtimeMs;
    } catch {
      return undefined;
    }
  }

  list(): JobMeta[] {
    this.ensureDir();
    const metas: JobMeta[] = [];
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue;
      const meta = this.read(file.replace(/\.json$/, ''));
      if (meta) metas.push(meta);
    }
    return metas.sort((a, b) => b.startedAt - a.startedAt);
  }

  remove(jobId: string): void {
    for (const file of [this.metaPath(jobId), this.outputPath(jobId)]) {
      try {
        fs.rmSync(file);
      } catch {
        // Already gone
      }
    }
  }

  /** Drops terminal jobs older than 24h and enforces the tracking cap. */
  prune(): void {
    const metas = this.list();
    const now = Date.now();
    const terminal = (m: JobMeta) =>
      m.status === 'completed' || m.status === 'failed' || m.status === 'cancelled';
    const expired = metas.filter(
      (m) => terminal(m) && (m.completedAt ?? m.startedAt) < now - MS_PER_DAY,
    );
    for (const meta of expired) this.remove(meta.id);

    const remaining = this.list().filter((m) => !expired.some((e) => e.id === m.id));
    if (remaining.length > MAX_TRACKED_JOBS) {
      for (const meta of remaining.slice(MAX_TRACKED_JOBS)) this.remove(meta.id);
    }
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private metaPath(jobId: string): string {
    return path.join(this.dir, `${jobId}.json`);
  }

  private outputPath(jobId: string): string {
    return path.join(this.dir, `${jobId}.output`);
  }
}
