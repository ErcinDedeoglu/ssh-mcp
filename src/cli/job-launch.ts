import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { getConfigPath } from '../config/path.js';
import { JobStore } from '../ssh/job-store.js';

export interface LaunchJobOptions {
  timeout?: number;
  stallTimeout?: number | null;
}

/**
 * Spawns a detached runner process that owns the job for its lifetime.
 * Initial metadata is persisted immediately so `job check` works right away.
 */
export function launchBackgroundJob(
  serverId: string,
  command: string,
  options: LaunchJobOptions = {},
): { jobId: string } {
  const store = new JobStore();
  const jobId = store.newId();

  store.save({
    id: jobId,
    serverId,
    command,
    status: 'pending',
    startedAt: Date.now(),
  });
  store.prune();

  const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.js');
  const args: string[] = [entry, 'run-job', jobId, serverId, '--config', getConfigPath()];
  if (options.timeout !== undefined) args.push('--timeout', String(options.timeout));
  if (options.stallTimeout !== undefined) {
    args.push('--stall-timeout', String(options.stallTimeout));
  }
  args.push('--', command);

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  return { jobId };
}
