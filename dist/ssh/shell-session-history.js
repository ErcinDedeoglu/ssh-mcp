// Shell command history tracking with size limits and truncation.
import { MAX_HISTORY_ENTRIES, createHistoryEntry, } from './shell-session.types.js';
export class ShellHistory {
    history = [];
    commandStartTime = 0;
    startCommand() {
        this.commandStartTime = Date.now();
    }
    record(command, stdout, exitCode) {
        this.history.push(createHistoryEntry(command, stdout, exitCode, Date.now() - this.commandStartTime));
        if (this.history.length > MAX_HISTORY_ENTRIES)
            this.history.shift();
    }
    get(limit) {
        if (limit === 0)
            return [];
        return this.history.slice(-(limit ?? this.history.length)).map((e) => ({ ...e }));
    }
    clear() {
        this.history = [];
    }
}
//# sourceMappingURL=shell-session-history.js.map