import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { FileTransfer, MAX_FILE_SIZE } from '../ssh/sftp.js';
import { ensureConnected, formatConnectionError } from './ensure-connected.js';
import { sanitizeError, sanitizePath } from './utils.js';

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
    async ({
      serverId,
      localPath,
      remotePath,
    }: {
      serverId: string;
      localPath: string;
      remotePath: string;
    }) => {
      try {
        const connectionResult = await ensureConnected(serverId, { config, pool, forwardRegistry });
        if (!connectionResult.success) {
          return formatConnectionError(connectionResult.errorInfo);
        }

        const { session } = connectionResult;

        const fileTransfer = new FileTransfer(session);
        await fileTransfer.upload(localPath, remotePath);
        session.touch();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'uploaded',
                serverId,
                localPath: sanitizePath(localPath),
                remotePath,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: sanitizeError(error),
            },
          ],
        };
      }
    },
  );
}
