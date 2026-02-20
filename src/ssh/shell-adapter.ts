// ShellAdapter interface and factory for shell-type-specific behavior.
import type { ConcreteShellType } from '../config/types.js';
import { PosixShellAdapter } from './shell-adapter-posix.js';
import { PowerShellAdapter } from './shell-adapter-powershell.js';
import { CmdShellAdapter } from './shell-adapter-cmd.js';

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

  /** Check if a line is an echoed wrapper command that should be filtered from output */
  isEchoedCommandLine(line: string, marker: string): boolean;

  /** EOF character to send after stdin content (\x04 for POSIX, \x1A for Windows) */
  readonly eofChar: string;

  /** Command to exit the shell */
  readonly exitCommand: string;
}

export function createShellAdapter(shellType: ConcreteShellType): ShellAdapter {
  switch (shellType) {
    case 'posix':
      return new PosixShellAdapter();
    case 'powershell':
      return new PowerShellAdapter();
    case 'cmd':
      return new CmdShellAdapter();
  }
}

/**
 * Detect shell type from the initial prompt text received after SSH connection.
 * Only the last non-empty line is analyzed (everything before is MOTD/banner).
 * - PowerShell prompts: "PS C:\Users\foo>" or "PS /home/foo>"
 * - cmd.exe prompts: "C:\Users\foo>" (drive letter path ending with >)
 * - Everything else is assumed to be POSIX (bash/sh/zsh)
 */
export function detectShellType(promptText: string): ConcreteShellType {
  const lines = promptText.split(/\r?\n/).filter((l) => l.trim());
  const lastLine = (lines[lines.length - 1] ?? '').trim();
  // PowerShell: word-bounded "PS" followed by space and path ending with >
  if (/\bPS\s+.+>/.test(lastLine)) return 'powershell';
  // cmd.exe: line starts with drive letter + colon + backslash, ends with >
  if (/^[A-Z]:\\[^>]*>\s*$/i.test(lastLine)) return 'cmd';
  return 'posix';
}
