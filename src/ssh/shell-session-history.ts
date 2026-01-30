// Shell command history tracking with size limits and truncation.
import {
  MAX_HISTORY_ENTRIES,
  createHistoryEntry,
  type HistoryEntry,
} from './shell-session.types.js';

export class ShellHistory {
  private history: HistoryEntry[] = [];
  private commandStartTime = 0;

  startCommand(): void {
    this.commandStartTime = Date.now();
  }

  record(command: string, stdout: string, exitCode: number): void {
    this.history.push(
      createHistoryEntry(command, stdout, exitCode, Date.now() - this.commandStartTime),
    );
    if (this.history.length > MAX_HISTORY_ENTRIES) this.history.shift();
  }

  get(limit?: number): HistoryEntry[] {
    if (limit === 0) return [];
    return this.history.slice(-(limit ?? this.history.length)).map((e) => ({ ...e }));
  }

  clear(): void {
    this.history = [];
  }
}
