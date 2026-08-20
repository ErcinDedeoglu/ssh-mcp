import type { ShellAdapter } from './shell-adapter.js';
import type { ShellStream } from './shell-session.types.js';
export interface WriteCommandOptions {
    stream: ShellStream;
    adapter: ShellAdapter;
    command: string;
    marker: string;
    stdin?: string;
    /** Called before each delayed write to verify the stream is still usable. */
    isAlive: () => boolean;
}
/**
 * Write a wrapped command to the stream, optionally followed by stdin + EOF.
 * Stdin delivery is delayed so the target process is ready to receive it.
 */
export declare function writeCommand(opts: WriteCommandOptions): void;
//# sourceMappingURL=shell-session-writer.d.ts.map