// Windows cmd.exe shell adapter.
import type { ShellAdapter } from './shell-adapter.js';
import type { ConcreteShellType } from '../config/types.js';
import { MCP_PROMPT } from './shell-session.types.js';

// cmd.exe commands that consume the entire line (& chains become part of comment).
const LINE_EATING_CMD = /^\s*(rem|::|goto)\b/i;

export class CmdShellAdapter implements ShellAdapter {
  readonly shellType: ConcreteShellType = 'cmd';
  readonly eofChar = '\x1A';
  readonly lineEnding = '\r\n';
  readonly exitCommand = 'exit';
  private lastWrapped = '';

  buildInitCommands(): string {
    return `prompt ${MCP_PROMPT}$_`;
  }

  wrapCommand(command: string, marker: string): string {
    // Two-line wrapper: line 1 runs the command, line 2 emits the marker and
    // exit code. cmd.exe parses each \r\n-terminated line as a separate unit,
    // so %ERRORLEVEL% on line 2 is expanded *after* line 1 completes —
    // reflecting the real exit code rather than a stale parse-time value.
    if (LINE_EATING_CMD.test(command)) {
      // rem/goto/:: eat the rest of the line, so they go on a separate line.
      // These are no-ops so we hardcode exit code 0.
      this.lastWrapped = `@${command}\r\n` + `@echo. & echo ${marker} & echo 0\r\n`;
    } else {
      this.lastWrapped = `@${command}\r\n` + `@echo. & echo ${marker} & echo %ERRORLEVEL%\r\n`;
    }
    return this.lastWrapped;
  }

  isEchoedCommandLine(line: string, marker: string, command?: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Filter wrapper infrastructure lines echoed by conhost
    if (trimmed.includes(`echo ${marker}`)) return true;
    if (!command) return false;
    // Exact match for the @-prefixed echoed command
    if (trimmed === `@${command}`) return true;
    // Conhost line-wraps long commands, producing fragments. These fragments
    // are substrings of the full wrapped text and typically contain cmd.exe
    // operators (& | > <) that real output lines rarely have.
    if (this.lastWrapped && trimmed.length >= 4) {
      const flat = this.lastWrapped.replace(/\r?\n/g, '');
      if (flat.includes(trimmed) && /[&|><]/.test(trimmed)) return true;
    }
    return false;
  }
}
