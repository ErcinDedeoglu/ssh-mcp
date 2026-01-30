import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { FileTransfer, MAX_FILE_SIZE } from '../ssh/sftp.js';
import { ensureConnected, formatConnectionError } from './ensure-connected.js';
import { sanitizeError, sanitizePath } from './utils.js';

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
    async ({
      serverId,
      remotePath,
      localPath,
    }: {
      serverId: string;
      remotePath: string;
      localPath: string;
    }) => {
      try {
        const connectionResult = await ensureConnected(serverId, { config, pool, forwardRegistry });
        if (!connectionResult.success) {
          return formatConnectionError(connectionResult.errorInfo);
        }

        const { session } = connectionResult;

        const fileTransfer = new FileTransfer(session);
        await fileTransfer.download(remotePath, localPath);
        session.touch();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'downloaded',
                serverId,
                remotePath,
                localPath: sanitizePath(localPath),
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
