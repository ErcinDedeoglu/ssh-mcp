import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JobRegistry } from '../ssh/job-registry.js';
import { truncateOutput, DEFAULT_MAX_OUTPUT_LENGTH } from './utils.js';

export function registerCheckJobTool(server: McpServer, jobRegistry: JobRegistry): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'check_job',
    'Check status and streaming output of a background job. ' +
      'Returns: status, partialOutput (real-time), bytesReceived, elapsedMs, msSinceLastOutput, and result when completed. ' +
      'Poll periodically to monitor progress. If msSinceLastOutput is very high, the command may be stalled. ' +
      'Output is truncated to maxOutputLength (default: 10000 chars). ' +
      'Response includes partialOutputTruncated/resultTruncated=true when truncated.',
    {
      jobId: z.string().describe('Job ID returned from execute_background'),
      maxOutputLength: z
        .number()
        .optional()
        .describe(
          'Maximum output length in chars before truncation. ' +
            'Default: 10000. Prevents large outputs from overwhelming the client.',
        ),
    },
    async ({ jobId, maxOutputLength }: { jobId: string; maxOutputLength?: number }) => {
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

      const effectiveMaxOutputLength = maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;

      if (job.result) {
        const { text: stdout, truncated } = truncateOutput(
          job.result.stdout,
          effectiveMaxOutputLength,
        );
        response.result = { ...job.result, stdout };
        response.resultTruncated = truncated;
      }

      if (job.error) {
        response.error = job.error;
      }

      if (job.output) {
        const { text: partialOutput, truncated } = truncateOutput(
          job.output,
          effectiveMaxOutputLength,
        );
        response.partialOutput = partialOutput;
        response.partialOutputTruncated = truncated;
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response) }],
      };
    },
  );
}
