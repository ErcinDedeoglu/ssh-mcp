// Writes wrapped commands (and optional stdin) to the shell stream.
import type { ShellAdapter } from './shell-adapter.js';
import type { ShellStream } from './shell-session.types.js';
import { STDIN_DELIVERY_DELAY_MS } from './shell-session.types.js';

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
export function writeCommand(opts: WriteCommandOptions): void {
  const { stream, adapter, command, marker, stdin, isAlive } = opts;
  stream.write(adapter.wrapCommand(command, marker));

  if (stdin !== undefined) {
    setTimeout(() => {
      if (!isAlive()) return;
      stream.write(stdin.endsWith('\n') ? stdin : stdin + '\n');
      stream.write(adapter.eofChar);
    }, STDIN_DELIVERY_DELAY_MS);
  }
}
