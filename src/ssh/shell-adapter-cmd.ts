// Windows cmd.exe shell adapter.
import type { ShellAdapter } from './shell-adapter.js';
import type { ConcreteShellType } from '../config/types.js';
import { MCP_PROMPT } from './shell-session.types.js';

export class CmdShellAdapter implements ShellAdapter {
  readonly shellType: ConcreteShellType = 'cmd';
  readonly eofChar = '\x1A';
  readonly lineEnding = '\r\n';
  readonly exitCommand = 'exit';

  buildInitCommands(): string {
    // Set the cmd.exe prompt to our marker prompt.
    // Note: @echo off doesn't suppress command echo in interactive cmd.exe,
    // so we rely on isEchoedCommandLine() to filter echoed commands from output.
    return `prompt ${MCP_PROMPT}$_`;
  }

  wrapCommand(command: string, marker: string): string {
    // @ suppresses echo of the line in cmd.exe interactive mode.
    // User command is on its own line so rem/goto/:: don't eat the marker chain.
    // echo. outputs a blank line (echo "" prints literal quotes in cmd).
    return (
      `@${command}\r\n` +
      `@set __MCP_EXIT=%ERRORLEVEL% ` +
      `& echo. & echo ${marker} & call echo %__MCP_EXIT%\r\n`
    );
  }

  isEchoedCommandLine(line: string, marker: string, command?: string): boolean {
    const trimmed = line.trim();
    // Filter the echoed user command (prefixed with @ to suppress in batch mode)
    if (command && trimmed === `@${command}`) return true;
    const hasExitCapture = trimmed.includes('__MCP_EXIT') || trimmed.includes('%ERRORLEVEL%');
    const hasMarkerEcho = trimmed.includes(`echo ${marker}`);
    return hasExitCapture || hasMarkerEcho;
  }
}
