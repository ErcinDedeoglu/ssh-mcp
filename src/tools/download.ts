import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { MAX_FILE_SIZE } from '../ssh/sftp.js';
import { downloadFile } from '../actions/download.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export function registerDownloadTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool,
  forwardRegistry: ForwardRegistry,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'download',
    `Download a file from a connected SSH server via SFTP. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    {
      serverId: z.string().describe('Unique identifier of the server to download from'),
      remotePath: z
        .string()
        .describe('Path to the file on the remote server (supports ~ for home directory)'),
      localPath: z.string().describe('Absolute path where the file should be saved locally'),
    },
    async (input: { serverId: string; remotePath: string; localPath: string }) => {
      const outcome = await downloadFile(input, partialDeps({ config, pool, forwardRegistry }));
      return toMcpResponse(outcome);
    },
  );
}
