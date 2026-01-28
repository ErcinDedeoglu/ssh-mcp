import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/types.js';
import { ConnectionPool } from '../ssh/pool.js';
import { sanitizeError } from './utils.js';

const DEFAULT_COMMAND_TIMEOUT_SECONDS = 60;
const MS_PER_SECOND = 1000;
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

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
  close: () => void;
  destroy: () => void;
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
    let stdoutSize = 0;
    let stderrSize = 0;
    let settled = false;
    let activeStream: ExecStream | null = null;

    const cleanup = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (activeStream) {
        activeStream.destroy();
      }
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      cleanup(new Error(`Command timed out after ${timeoutSeconds} seconds`));
    }, timeoutMs);

    client.exec(command, (err, stream) => {
      if (err) {
        cleanup(err);
        return;
      }

      activeStream = stream;

      stream.on('data', (data: Buffer) => {
        if (settled) return;
        stdoutSize += data.length;
        if (stdoutSize > MAX_OUTPUT_SIZE) {
          cleanup(new Error(`Command output exceeded ${MAX_OUTPUT_SIZE} bytes limit`));
          return;
        }
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        if (settled) return;
        stderrSize += data.length;
        if (stderrSize > MAX_OUTPUT_SIZE) {
          cleanup(new Error(`Command stderr exceeded ${MAX_OUTPUT_SIZE} bytes limit`));
          return;
        }
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
        cleanup(streamErr);
      });
    });
  });
}
