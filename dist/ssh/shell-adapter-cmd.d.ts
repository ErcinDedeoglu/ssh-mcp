import type { ShellAdapter } from './shell-adapter.js';
import type { ConcreteShellType } from '../config/types.js';
export declare class CmdShellAdapter implements ShellAdapter {
    readonly shellType: ConcreteShellType;
    readonly eofChar = "\u001A";
    readonly lineEnding = "\r\n";
    readonly exitCommand = "exit";
    private lastWrapped;
    buildInitCommands(): string;
    wrapCommand(command: string, marker: string): string;
    isEchoedCommandLine(line: string, marker: string, command?: string): boolean;
}
//# sourceMappingURL=shell-adapter-cmd.d.ts.map