import type { Client } from 'ssh2';
import { MCP_PROMPT, stripControlSequences, type ShellStream } from './shell-session.types.js';

export interface CreateShellStreamOptions {
  agentForward?: boolean;
}

export function createShellStream(
  client: Client,
  options: CreateShellStreamOptions = {},
): Promise<ShellStream> {
  return new Promise((resolve, reject) => {
    // ssh2 supports agentForward in shell options but types are incomplete
    const shellOptions = { agentForward: options.agentForward ?? false } as Record<string, unknown>;
    client.shell({ term: 'dumb' }, shellOptions, (err, stream) => {
      if (err) reject(err);
      else resolve(stream as ShellStream);
    });
  });
}

export function waitForPattern(
  stream: ShellStream,
  pattern: RegExp,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for shell prompt'));
    }, timeoutMs);

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      if (pattern.test(stripControlSequences(buffer))) {
        cleanup();
        resolve();
      }
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      stream.removeListener('data', onData);
    };

    stream.on('data', onData);
  });
}

export function waitForInitialPrompt(stream: ShellStream, timeoutMs: number): Promise<void> {
  return waitForPattern(stream, /[$#>%]\s*$/, timeoutMs);
}

export function waitForMcpPrompt(stream: ShellStream, timeoutMs: number): Promise<void> {
  return waitForPattern(stream, new RegExp(`${MCP_PROMPT}\\s*$`), timeoutMs);
}
