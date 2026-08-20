import { z } from 'zod';
import { MAX_FILE_SIZE } from '../ssh/sftp.js';
import { downloadFile } from '../actions/download.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerDownloadTool(server, config, pool, forwardRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('download', `Download a file from a connected SSH server via SFTP. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`, {
        serverId: z.string().describe('Unique identifier of the server to download from'),
        remotePath: z
            .string()
            .describe('Path to the file on the remote server (supports ~ for home directory)'),
        localPath: z.string().describe('Absolute path where the file should be saved locally'),
    }, async (input) => {
        const outcome = await downloadFile(input, partialDeps({ config, pool, forwardRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=download.js.map