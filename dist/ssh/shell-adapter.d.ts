import type { ConcreteShellType } from '../config/types.js';
export type { ShellType, ConcreteShellType } from '../config/types.js';
/**
 * Abstracts shell-specific behavior for prompt setup, command wrapping,
 * and output filtering. Each shell type (posix, powershell, cmd) provides
 * its own implementation.
 */
export interface ShellAdapter {
    /** Shell type identifier */
    readonly shellType: ConcreteShellType;
    /** Commands to initialize the shell (set custom prompt, disable echo, etc.) */
    buildInitCommands(): string;
    /** Wrap a user command with exit code capture and end marker */
    wrapCommand(command: string, marker: string): string;
    /** Check if a line is an echoed wrapper/user command that should be filtered from output */
    isEchoedCommandLine(line: string, marker: string, command?: string): boolean;
    /** EOF character to send after stdin content (\x04 for POSIX, \x1A for Windows) */
    readonly eofChar: string;
    /** Line ending for command submission (\n for POSIX, \r\n for Windows) */
    readonly lineEnding: string;
    /** Command to exit the shell */
    readonly exitCommand: string;
}
export declare function createShellAdapter(shellType: ConcreteShellType): ShellAdapter;
/**
 * Detect shell type from the initial prompt text received after SSH connection.
 * Only the last non-empty line is analyzed (everything before is MOTD/banner).
 * - PowerShell prompts: "PS C:\Users\foo>" or "PS /home/foo>"
 * - cmd.exe prompts: "C:\Users\foo>" (drive letter path ending with >)
 * - Everything else is assumed to be POSIX (bash/sh/zsh)
 */
export declare function detectShellType(promptText: string): ConcreteShellType;
//# sourceMappingURL=shell-adapter.d.ts.map