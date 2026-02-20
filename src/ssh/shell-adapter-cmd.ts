// Windows cmd.exe shell adapter.
import type { ShellAdapter } from './shell-adapter.js';
import type { ConcreteShellType } from '../config/types.js';
import { MCP_PROMPT } from './shell-session.types.js';

export class CmdShellAdapter implements ShellAdapter {
  readonly shellType: ConcreteShellType = 'cmd';
  readonly eofChar = '\x1A';
  readonly exitCommand = 'exit';

  buildInitCommands(): string {
    // Set the cmd.exe prompt to our marker prompt.
    // `prompt $S` alone would show just a space; we use our MCP prompt string.
    // `@echo off` suppresses command echo (cmd.exe echoes commands by default).
    return `@echo off & prompt ${MCP_PROMPT}$_`;
  }

  wrapCommand(command: string, marker: string): string {
    // cmd.exe: use & for command chaining, %ERRORLEVEL% for exit code,
    // echo. for blank line (echo "" prints literal quotes in cmd).
    return (
      `${command} & set __MCP_EXIT=%ERRORLEVEL% ` +
      `& echo. & echo ${marker} & call echo %__MCP_EXIT%\n`
    );
  }

  isEchoedCommandLine(line: string, marker: string): boolean {
    const hasExitCapture =
      line.includes('__MCP_EXIT') || line.includes('%ERRORLEVEL%') || line.includes('%__MCP_EXIT%');
    const hasMarkerEcho = line.includes(`echo ${marker}`) || line.includes(marker);
    const hasEchoPattern = line.includes('echo.') && hasExitCapture;
    // cmd.exe echoes the full command line before output unless @echo off is effective
    return hasExitCapture || (hasMarkerEcho && hasEchoPattern);
  }
}
