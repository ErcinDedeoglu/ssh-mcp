import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JobRegistry } from '../ssh/job-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { cancelJob } from '../actions/cancel-job.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

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
    async (input: { jobId: string }) => {
      const outcome = await cancelJob(input, partialDeps({ jobRegistry, shellRegistry }));
      return toMcpResponse(outcome);
    },
  );
}
