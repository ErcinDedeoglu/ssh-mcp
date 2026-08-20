import type { ShellAdapter } from './shell-adapter.js';
import type { ConcreteShellType } from '../config/types.js';
export declare class PosixShellAdapter implements ShellAdapter {
    readonly shellType: ConcreteShellType;
    readonly eofChar = "\u0004";
    readonly lineEnding = "\n";
    readonly exitCommand = "exit";
    buildInitCommands(): string;
    wrapCommand(command: string, marker: string): string;
    isEchoedCommandLine(line: string, marker: string): boolean;
}
//# sourceMappingURL=shell-adapter-posix.d.ts.map