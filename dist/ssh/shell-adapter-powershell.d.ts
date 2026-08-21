import type { ShellAdapter } from './shell-adapter.js';
import type { ConcreteShellType } from '../config/types.js';
export declare class PowerShellAdapter implements ShellAdapter {
    readonly shellType: ConcreteShellType;
    readonly eofChar = "\u001A";
    readonly lineEnding = "\r\n";
    readonly exitCommand = "exit";
    buildInitCommands(): string;
    wrapCommand(command: string, marker: string): string;
    isEchoedCommandLine(line: string, marker: string): boolean;
}
//# sourceMappingURL=shell-adapter-powershell.d.ts.map