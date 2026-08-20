import { z } from 'zod';
import { executeBackground } from '../actions/execute-background.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerExecuteBackgroundTool(server, config, pool, forwardRegistry, shellRegistry, jobRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('execute_background', 'Execute a shell command in the background, returning a job ID immediately. ' +
        'Use check_job to poll for status and streaming output. Ideal for long-running commands (>5min) ' +
        'like builds, package installs, or large file operations. ' +
        'Output is streamed in real-time - check_job returns partial output as the command runs. ' +
        'For commands <5min, prefer execute with stallTimeout=0.', {
        serverId: z.string().describe('Unique identifier of the server to execute command on'),
        command: z.string().describe('Shell command to execute on the remote server'),
        timeout: z
            .number()
            .optional()
            .describe('Command timeout in seconds (overrides server config)'),
        stallTimeout: z
            .number()
            .nullable()
            .optional()
            .describe('Stall timeout in seconds. Set to 0 or null to disable.'),
    }, async (input) => {
        const outcome = await executeBackground(input, partialDeps({ config, pool, forwardRegistry, shellRegistry, jobRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=execute-background.js.map