import { z } from 'zod';
import { checkJob } from '../actions/check-job.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerCheckJobTool(server, jobRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('check_job', 'Check status and streaming output of a background job. ' +
        'Returns: status, partialOutput (real-time), bytesReceived, elapsedMs, msSinceLastOutput, and result when completed. ' +
        'Poll periodically to monitor progress. If msSinceLastOutput is very high, the command may be stalled. ' +
        'Output is truncated to maxOutputLength (default: 10000 chars). ' +
        'Response includes partialOutputTruncated/resultTruncated=true when truncated.', {
        jobId: z.string().describe('Job ID returned from execute_background'),
        maxOutputLength: z
            .number()
            .optional()
            .describe('Maximum output length in chars before truncation. ' +
            'Default: 10000. Prevents large outputs from overwhelming the client.'),
    }, async (input) => {
        const outcome = await checkJob(input, partialDeps({ jobRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=check-job.js.map