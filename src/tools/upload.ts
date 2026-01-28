import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { FileTransfer, MAX_FILE_SIZE } from '../ssh/sftp.js';
import { sanitizeError, sanitizePath } from './utils.js';

export const uploadInputSchema = z.object({
  serverId: z.string().describe('Unique identifier of the server to upload to'),
  localPath: z.string().describe('Absolute path to the local file to upload'),
  remotePath: z.string().describe('Destination path on the remote server (supports ~ for home directory)'),
});

export function registerUploadTool(
  server: McpServer,
  pool: ConnectionPool
): void {
  server.tool(
    'upload',
    `Upload a file to a connected SSH server via SFTP. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    uploadInputSchema.shape,
    async ({ serverId, localPath, remotePath }) => {
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
    }
  );
}
