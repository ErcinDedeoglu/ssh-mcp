import { STDIN_DELIVERY_DELAY_MS } from './shell-session.types.js';
/**
 * Write a wrapped command to the stream, optionally followed by stdin + EOF.
 * Stdin delivery is delayed so the target process is ready to receive it.
 */
export function writeCommand(opts) {
    const { stream, adapter, command, marker, stdin, isAlive } = opts;
    stream.write(adapter.wrapCommand(command, marker));
    if (stdin !== undefined) {
        setTimeout(() => {
            if (!isAlive())
                return;
            stream.write(stdin.endsWith('\n') ? stdin : stdin + '\n');
            stream.write(adapter.eofChar);
        }, STDIN_DELIVERY_DELAY_MS);
    }
}
//# sourceMappingURL=shell-session-writer.js.map