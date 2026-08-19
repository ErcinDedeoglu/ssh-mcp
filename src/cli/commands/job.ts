import type { Command } from 'commander';
import { checkJob } from '../../actions/check-job.js';
import { cancelJob } from '../../actions/cancel-job.js';
import { buildCliDeps, cleanupCli } from '../context.js';
import { JobStore } from '../../ssh/job-store.js';
import { report } from '../output.js';

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function registerJobCommand(program: Command): void {
  const job = program.command('job').description('Manage background jobs started with `exec --bg`');

  job
    .command('list')
    .description('List persisted jobs (most recent first)')
    .argument('[serverId]', 'filter by server ID')
    .action((serverId: string | undefined) => {
      const store = new JobStore();
      const jobs = store.list().filter((j) => !serverId || j.serverId === serverId);
      const rows = jobs.map((j) => {
        const alive = j.pid !== undefined && isPidAlive(j.pid);
        return {
          jobId: j.id,
          serverId: j.serverId,
          command: j.command,
          status: j.status,
          startedAt: new Date(j.startedAt).toISOString(),
          runnerAlive:
            j.pid !== undefined && (j.status === 'running' || j.status === 'pending')
              ? alive
              : undefined,
        };
      });
      if (job.optsWithGlobals().json) {
        console.log(JSON.stringify(rows, null, 2));
      } else {
        for (const r of rows) {
          const aliveHint = r.runnerAlive === false ? ' (runner dead)' : '';
          console.log(`${r.jobId}  ${r.status.padEnd(9)} ${r.serverId}  ${r.command}${aliveHint}`);
        }
        if (rows.length === 0) console.log('No jobs found.');
      }
    });

  job
    .command('check')
    .description('Check status and output of a background job')
    .argument('<jobId>', 'job ID')
    .option('--max-output <chars>', 'truncate output to N chars')
    .action(async (jobId: string, options) => {
      const deps = buildCliDeps();
      try {
        const json = job.optsWithGlobals().json as boolean;
        const outcome = await checkJob(
          { jobId, maxOutputLength: options.maxOutput ? Number(options.maxOutput) : undefined },
          deps,
        );
        if (outcome.ok && !json) {
          const d = outcome.data;
          console.error(
            `${d.jobId}: ${d.status} (elapsed ${Math.round(Number(d.elapsedMs) / 1000)}s)`,
          );
          const text =
            (d.partialOutput as string) ?? (d.result as { stdout?: string })?.stdout ?? '';
          if (text) process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
          if (d.error) console.error(`error: ${d.error}`);
          process.exitCode = d.status === 'failed' ? 1 : 0;
          return;
        }
        process.exitCode = report(outcome, json);
      } finally {
        cleanupCli(deps);
      }
    });

  job
    .command('cancel')
    .description('Cancel a running background job')
    .argument('<jobId>', 'job ID')
    .action(async (jobId: string) => {
      const deps = buildCliDeps();
      try {
        const json = job.optsWithGlobals().json as boolean;
        const outcome = await cancelJob({ jobId }, deps);
        process.exitCode = report(outcome, json, (d) =>
          console.log(`${(d as { jobId: string }).jobId}: ${(d as { message: string }).message}`),
        );
      } finally {
        cleanupCli(deps);
      }
    });
}
