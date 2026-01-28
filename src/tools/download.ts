import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { FileTransfer, MAX_FILE_SIZE } from '../ssh/sftp.js';
import { sanitizeError, sanitizePath } from './utils.js';

export function registerDownloadTool(
  server: McpServer,
  pool: ConnectionPool
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'download',
    `Download a file from a connected SSH server via SFTP. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    {
      serverId: z.string().describe('Unique identifier of the server to download from'),
      remotePath: z.string().describe('Path to the file on the remote server (supports ~ for home directory)'),
      localPath: z.string().describe('Absolute path where the file should be saved locally'),
    },
    async ({ serverId, remotePath, localPath }: { serverId: string; remotePath: string; localPath: string }) => {
      try {
        const session = pool.get(serverId);
        if (!session) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `No active connection to server '${serverId}'. Use connect tool first.`,
              },
            ],
          };
        }

        if (!session.isConnected) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Connection to '${serverId}' is not active. Reconnect required.`,
              },
            ],
          };
        }

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
    }
  );
}
