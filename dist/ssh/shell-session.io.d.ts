import type { Client } from 'ssh2';
import { type ShellStream } from './shell-session.types.js';
export interface CreateShellStreamOptions {
    agentForward?: boolean;
}
export declare function createShellStream(client: Client, options?: CreateShellStreamOptions): Promise<ShellStream>;
export declare function waitForPattern(stream: ShellStream, pattern: RegExp, timeoutMs: number): Promise<string>;
export declare function waitForInitialPrompt(stream: ShellStream, timeoutMs: number): Promise<string>;
export declare function waitForMcpPrompt(stream: ShellStream, timeoutMs: number): Promise<string>;
//# sourceMappingURL=shell-session.io.d.ts.map