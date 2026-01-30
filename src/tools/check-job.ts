import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JobRegistry } from '../ssh/job-registry.js';

export function registerCheckJobTool(server: McpServer, jobRegistry: JobRegistry): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'check_job',
    'Check status and streaming output of a background job. ' +
      'Returns: status, partialOutput (real-time), bytesReceived, elapsedMs, msSinceLastOutput, and result when completed. ' +
      'Poll periodically to monitor progress. If msSinceLastOutput is very high, the command may be stalled.',
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

      const now = Date.now();
      const response: Record<string, unknown> = {
        jobId: job.id,
        serverId: job.serverId,
        command: job.command,
        status: job.status,
        startedAt: new Date(job.startedAt).toISOString(),
        elapsedMs: now - job.startedAt,
        bytesReceived: job.bytesReceived,
      };

      if (job.lastOutputAt) {
        response.lastOutputAt = new Date(job.lastOutputAt).toISOString();
        response.msSinceLastOutput = now - job.lastOutputAt;
      }

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
