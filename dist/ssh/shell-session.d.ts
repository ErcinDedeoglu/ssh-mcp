import type { Client } from 'ssh2';
import { type ShellExecuteResult, type ShellSessionOptions, type HistoryEntry, type ExecuteOptions } from './shell-session.types.js';
export type { ShellExecuteResult, HistoryEntry, ExecuteOptions } from './shell-session.types.js';
export declare class ShellSession {
    private stream;
    private ready;
    private buffer;
    private currentCommand;
    private commandQueue;
    private readonly options;
    private readonly agentForward;
    private adapter;
    private readonly timers;
    private outputSize;
    private readonly historyTracker;
    constructor(opts?: ShellSessionOptions);
    get isReady(): boolean;
    get hasAgentForward(): boolean;
    get shellType(): string;
    get hasRunningCommand(): boolean;
    initialize(client: Client): Promise<void>;
    execute(cmd: string, options?: ExecuteOptions | number): Promise<ShellExecuteResult>;
    destroy(): void;
    private setupStreamHandlers;
    private handleData;
    private handleClose;
    private handleError;
    cancelCurrentCommand(): boolean;
    private processNextCommand;
    private resetStallTimer;
    private completeCurrentCommand;
    getHistory(limit?: number): HistoryEntry[];
    private rejectPendingCommands;
}
//# sourceMappingURL=shell-session.d.ts.map