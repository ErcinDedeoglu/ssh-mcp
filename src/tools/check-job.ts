import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JobRegistry } from '../ssh/job-registry.js';

export function registerCheckJobTool(server: McpServer, jobRegistry: JobRegistry): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'check_job',
    'Check the status and output of a background job. Returns job status, output, and result if completed.',
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

      const response: Record<string, unknown> = {
        jobId: job.id,
        serverId: job.serverId,
        command: job.command,
        status: job.status,
        startedAt: new Date(job.startedAt).toISOString(),
      };

      if (job.completedAt) {
        response.completedAt = new Date(job.completedAt).toISOString();
        response.durationMs = job.completedAt - job.startedAt;
      }

      if (job.result) {
        response.result = job.result;
      }

      if (job.error) {
        response.error = job.error;
      }

      if (job.output) {
        response.partialOutput = job.output;
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response) }],
      };
    },
  );
}
