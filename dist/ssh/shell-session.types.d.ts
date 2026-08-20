import type { ClientChannel } from 'ssh2';
import type { ShellAdapter } from './shell-adapter.js';
export declare const MCP_PROMPT = "__MCP_PROMPT__";
export declare const MCP_PROMPT_CONTINUATION = "__MCP_PROMPT2__";
export declare const DEFAULT_SHELL_TIMEOUT_MS = 30000;
export declare const DEFAULT_STALL_TIMEOUT_MS = 10000;
export declare const MAX_OUTPUT_SIZE: number;
export declare const MAX_HISTORY_ENTRIES = 100;
export declare const MAX_HISTORY_OUTPUT_LENGTH: number;
export declare const STDIN_DELIVERY_DELAY_MS = 100;
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
    stallTimeoutMs?: number | null;
    stdin?: string;
    onOutput?: (chunk: string) => void;
}
export interface ShellSessionOptions {
    timeoutMs?: number;
    stallTimeoutMs?: number | null;
    agentForward?: boolean;
    shellType?: 'auto' | 'posix' | 'powershell' | 'cmd';
}
export type ResolvedShellOptions = Required<Omit<ShellSessionOptions, 'agentForward' | 'shellType'>>;
export type ShellStream = ClientChannel & {
    stderr: NodeJS.ReadableStream;
};
export declare function generateMarker(): string;
export declare function stripControlSequences(str: string): string;
export declare function parseMarkedOutput(buffer: string, marker: string, adapter: ShellAdapter, command?: string): {
    output: string;
    exitCode: number;
    remaining: string;
} | null;
export declare function createHistoryEntry(command: string, stdout: string, exitCode: number, durationMs: number): HistoryEntry;
//# sourceMappingURL=shell-session.types.d.ts.map