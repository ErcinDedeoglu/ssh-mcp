import type { Command } from 'commander';
export declare function registerUpdateCommand(program: Command): void;
/** Non-blocking banner: nudges when a newer version exists. Never throws. */
export declare function notifyUpdate(program: Command): Promise<void>;
//# sourceMappingURL=update.d.ts.map