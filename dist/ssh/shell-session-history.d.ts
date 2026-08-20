import { type HistoryEntry } from './shell-session.types.js';
export declare class ShellHistory {
    private history;
    private commandStartTime;
    startCommand(): void;
    record(command: string, stdout: string, exitCode: number): void;
    get(limit?: number): HistoryEntry[];
    clear(): void;
}
//# sourceMappingURL=shell-session-history.d.ts.map