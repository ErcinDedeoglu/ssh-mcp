import { z } from 'zod';
import { MAX_FILE_SIZE } from '../ssh/sftp.js';
import { uploadFile } from '../actions/upload.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';
export function registerUploadTool(server, config, pool, forwardRegistry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool('upload', `Upload a file to a connected SSH server via SFTP. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`, {
        serverId: z.string().describe('Unique identifier of the server to upload to'),
        localPath: z.string().describe('Absolute path to the local file to upload'),
        remotePath: z
            .string()
            .describe('Destination path on the remote server (supports ~ for home directory)'),
    }, async (input) => {
        const outcome = await uploadFile(input, partialDeps({ config, pool, forwardRegistry }));
        return toMcpResponse(outcome);
    });
}
//# sourceMappingURL=upload.js.map