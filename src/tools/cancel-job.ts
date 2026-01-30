import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JobRegistry } from '../ssh/job-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';

export function registerCancelJobTool(
  server: McpServer,
  jobRegistry: JobRegistry,
  shellRegistry: ShellRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'cancel_job',
    'Cancel a running background job. Sends SIGINT (Ctrl+C) to the remote process.',
    {
      jobId: z.string().describe('Job ID returned from execute_background'),
    },
    async ({ jobId }: { jobId: string }) => {
      const job = jobRegistry.get(jobId);

      if (!job) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'job_not_found',
                message: `Job ${jobId} not found`,
              }),
            },
          ],
        };
      }

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                jobId: job.id,
                status: job.status,
                message: `Job already ${job.status}`,
              }),
            },
          ],
        };
      }

      let interruptSent = false;
      const shell = shellRegistry.get(job.serverId);
      if (shell?.hasRunningCommand) {
        interruptSent = shell.cancelCurrentCommand();
      }

      const jobToUpdate = jobRegistry.get(jobId)!;
      jobToUpdate.status = 'cancelled';
      jobToUpdate.error = 'Job cancelled by user';
      jobToUpdate.completedAt = Date.now();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              jobId: job.id,
              status: 'cancelled',
              interruptSent,
              message: interruptSent
                ? 'Job cancelled and SIGINT sent to remote process.'
                : 'Job marked as cancelled.',
            }),
          },
        ],
      };
    },
  );
}
