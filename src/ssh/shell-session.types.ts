// ShellSession types, constants, and pure utility functions.
import type { ClientChannel } from 'ssh2';

export const MCP_PROMPT = '__MCP_PROMPT__';
export const MCP_PROMPT_CONTINUATION = '__MCP_PROMPT2__';
export const DEFAULT_SHELL_TIMEOUT_MS = 30000;
export const DEFAULT_STALL_TIMEOUT_MS = 10000;
export const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;
export const MAX_HISTORY_ENTRIES = 100;
export const MAX_HISTORY_OUTPUT_LENGTH = 50 * 1024;

export interface ShellExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface HistoryEntry {
  timestamp: string;
  command: string;
  stdout: string;
  exitCode: number;
  durationMs: number;
}

export interface PendingCommand {
  command: string;
  marker: string;
  timeoutMs: number;
  stallTimeoutMs: number | null;
  stdin?: string;
  onOutput?: (chunk: string) => void;
  resolve: (result: ShellExecuteResult) => void;
  reject: (error: Error) => void;
}

export interface ExecuteOptions {
  timeoutMs?: number;
  stallTimeoutMs?: number | null; // undefined = use session default, null/0 = disabled
  stdin?: string; // Content to write to command's stdin (sent after command, followed by EOF)
  onOutput?: (chunk: string) => void; // Callback for streaming output during execution
}

export interface ShellSessionOptions {
  timeoutMs?: number;
  stallTimeoutMs?: number | null; // null = disabled
  agentForward?: boolean;
}

export type ResolvedShellOptions = Required<Omit<ShellSessionOptions, 'agentForward'>>;

export type ShellStream = ClientChannel & {
  stderr: NodeJS.ReadableStream;
};

export function generateMarker(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `__MCP_END_${timestamp}_${random}__`;
}

export function stripControlSequences(str: string): string {
  return str
    .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '') // ANSI escape sequences (including private modes like \e[?2004h)
    .replace(/\x1B][^\x07]*\x07/g, '') // OSC sequences
    .replace(/\r(?!\n)/g, ''); // Carriage returns not followed by newline
}

export function buildShellInitCommands(): string {
  return [
    `export PS1="${MCP_PROMPT}"`,
    `export PS2="${MCP_PROMPT_CONTINUATION}"`,
    'export TERM=dumb',
    'export DEBIAN_FRONTEND=noninteractive',
    'unset HISTFILE',
    'stty -echo 2>/dev/null || true',
  ].join('; ');
}

export function wrapCommand(command: string, marker: string): string {
  return `${command}; __MCP_EXIT=$?; echo ""; echo "${marker}"; echo $__MCP_EXIT\n`;
}

function isEchoedCommandLine(line: string, marker: string): boolean {
  const hasExitCapture = line.includes('__MCP_EXIT') || line.includes('$__MCP_EXIT');
  const hasMarkerEcho = line.includes(`echo "${marker}"`) || line.includes(`"${marker}"`);
  const hasEchoPattern = line.includes('echo ""') && hasExitCapture;
  return hasExitCapture || hasMarkerEcho || hasEchoPattern;
}

function findStandaloneMarker(buffer: string, marker: string): number {
  const markerLinePattern = new RegExp(`(^|\\n)${marker}(\\r?\\n|$)`);
  const match = buffer.match(markerLinePattern);
  if (!match || match.index === undefined) return -1;
  return match.index + (match[1] === '\n' ? 1 : 0);
}

export function parseMarkedOutput(
  buffer: string,
  marker: string,
): { output: string; exitCode: number; remaining: string } | null {
  const markerIndex = findStandaloneMarker(buffer, marker);
  if (markerIndex === -1) return null;

  const beforeMarker = buffer.substring(0, markerIndex);
  const afterMarker = buffer.substring(markerIndex + marker.length);
  const exitCodeMatch = afterMarker.match(/^[\s\r\n]*(\d+)/);
  if (!exitCodeMatch) return null;
  const exitCode = parseInt(exitCodeMatch[1], 10);
  const remaining = afterMarker.replace(/^[\s\r\n]*\d+[\s\r\n]*/, '');

  const cleaned = stripControlSequences(beforeMarker);
  const lines = cleaned.split('\n');
  const outputLines = lines.filter((line) => !isEchoedCommandLine(line, marker));
  // Strip leading prompt that appears from the previous command
  let output = outputLines.join('\n').trim();
  if (output.startsWith(MCP_PROMPT)) {
    output = output.substring(MCP_PROMPT.length).trim();
  }

  return {
    output,
    exitCode,
    remaining: remaining.replace(new RegExp(`^${MCP_PROMPT}`, 'g'), ''),
  };
}

export function createHistoryEntry(
  command: string,
  stdout: string,
  exitCode: number,
  durationMs: number,
): HistoryEntry {
  const truncatedOutput =
    stdout.length > MAX_HISTORY_OUTPUT_LENGTH
      ? stdout.slice(0, MAX_HISTORY_OUTPUT_LENGTH) + '\n... (truncated)'
      : stdout;

  return {
    timestamp: new Date().toISOString(),
    command,
    stdout: truncatedOutput,
    exitCode,
    durationMs,
  };
}
