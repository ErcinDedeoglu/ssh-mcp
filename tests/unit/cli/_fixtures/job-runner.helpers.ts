/**
 * Reusable fake ActionDeps for job-runner tests (real JobStore in temp dir).
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { JobStore } from '../../../../src/ssh/job-store.js';
import { ShellRegistry } from '../../../../src/ssh/shell-registry.js';

export interface FakeDeps {
  config: { servers: unknown[] };
  pool: { get: () => undefined };
  forwardRegistry: Record<string, never>;
  remoteForwardRegistry: Record<string, never>;
  shellRegistry: InstanceType<typeof ShellRegistry>;
  jobRegistry: Record<string, never>;
  jobStore: JobStore;
}

export function makeRunnerDeps(dir?: string): FakeDeps {
  const jobsDir =
    dir ??
    path.join(os.tmpdir(), `ssh-mcp-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return {
    config: { servers: [] },
    pool: { get: () => undefined },
    forwardRegistry: {} as Record<string, never>,
    remoteForwardRegistry: {} as Record<string, never>,
    shellRegistry: new ShellRegistry(),
    jobRegistry: {} as Record<string, never>,
    jobStore: new JobStore(jobsDir),
  };
}
