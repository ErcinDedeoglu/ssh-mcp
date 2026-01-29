import { MCP_PROMPT, type ShellStream } from './shell-session.types.js';

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
      if (pattern.test(buffer)) {
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
  return waitForPattern(stream, /[$#>]\s*$/, timeoutMs);
}

export function waitForMcpPrompt(stream: ShellStream, timeoutMs: number): Promise<void> {
  return waitForPattern(stream, new RegExp(`${MCP_PROMPT}\\s*$`), timeoutMs);
}
