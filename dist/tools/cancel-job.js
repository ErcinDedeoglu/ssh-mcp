import { z } from 'zod';
import { cancelJob } from '../actions/cancel-job.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerCancelJobTool(server, jobRegistry, shellRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('cancel_job', 'Cancel a running background job. Sends SIGINT (Ctrl+C) to the remote process.', {
        jobId: z.string().describe('Job ID returned from execute_background'),
    }, async (input) => {
        const outcome = await cancelJob(input, partialDeps({ jobRegistry, shellRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=cancel-job.js.map