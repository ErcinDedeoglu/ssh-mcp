import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { MAX_FILE_SIZE } from '../ssh/sftp.js';
import { uploadFile } from '../actions/upload.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export function registerUploadTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'upload',
    `Upload a file to a connected SSH server via SFTP. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    {
      serverId: z.string().describe('Unique identifier of the server to upload to'),
      localPath: z.string().describe('Absolute path to the local file to upload'),
      remotePath: z
        .string()
        .describe('Destination path on the remote server (supports ~ for home directory)'),
    },
    async (input: { serverId: string; localPath: string; remotePath: string }) => {
      const outcome = await uploadFile(input, partialDeps({ config, pool, forwardRegistry }));
      return toMcpResponse(outcome);
    },
  );
}
