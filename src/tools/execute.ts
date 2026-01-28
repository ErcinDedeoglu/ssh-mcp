import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { sanitizeError } from './utils.js';

const DEFAULT_COMMAND_TIMEOUT_SECONDS = 60;
const MS_PER_SECOND = 1000;

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function registerExecuteTool(
  server: McpServer,
  config: Config,
  pool: ConnectionPool
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'execute',
    'Execute a shell command on a connected SSH server',
    {
      serverId: z.string().describe('Unique identifier of the server to execute command on'),
      command: z.string().describe('Shell command to execute on the remote server'),
      timeout: z.number().optional().describe('Command timeout in seconds (overrides server config)'),
    },
    async ({ serverId, command, timeout }: { serverId: string; command: string; timeout?: number }) => {
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

        const serverConfig = config.servers.find((s) => s.id === serverId);
        const timeoutSeconds = timeout 
          ?? serverConfig?.timeouts?.command 
          ?? config.defaults?.timeouts?.command 
          ?? DEFAULT_COMMAND_TIMEOUT_SECONDS;

        const result = await executeCommand(session.client, command, timeoutSeconds);
        session.touch();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                serverId,
                command,
                ...result,
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

interface ExecStream extends NodeJS.ReadableStream {
  stderr: NodeJS.ReadableStream;
}

function executeCommand(
  client: { exec: (cmd: string, callback: (err: Error | undefined, stream: ExecStream) => void) => void },
  command: string,
  timeoutSeconds: number
): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = timeoutSeconds * MS_PER_SECOND;
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Command timed out after ${timeoutSeconds} seconds`));
    }, timeoutMs);

    client.exec(command, (err, stream) => {
      if (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err);
        return;
      }

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on('close', (code: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      stream.on('error', (streamErr: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(streamErr);
      });
    });
  });
}
