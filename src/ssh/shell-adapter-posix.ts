// POSIX (bash/sh/zsh) shell adapter.
import type { ShellAdapter } from './shell-adapter.js';
import type { ConcreteShellType } from '../config/types.js';
import { MCP_PROMPT, MCP_PROMPT_CONTINUATION } from './shell-session.types.js';

export class PosixShellAdapter implements ShellAdapter {
  readonly shellType: ConcreteShellType = 'posix';
  readonly eofChar = '\x04';
  readonly lineEnding = '\n';
  readonly exitCommand = 'exit';

  buildInitCommands(): string {
    return [
      `export PS1="${MCP_PROMPT}"`,
      `export PS2="${MCP_PROMPT_CONTINUATION}"`,
      'export TERM=dumb',
      'export DEBIAN_FRONTEND=noninteractive',
      'unset HISTFILE',
      'stty -echo 2>/dev/null || true',
    ].join('; ');
  }

  wrapCommand(command: string, marker: string): string {
    return `${command}; __MCP_EXIT=$?; echo ""; echo "${marker}"; echo $__MCP_EXIT\n`;
  }

  isEchoedCommandLine(line: string, marker: string): boolean {
    const hasExitCapture = line.includes('__MCP_EXIT') || line.includes('$__MCP_EXIT');
    const hasMarkerEcho = line.includes(`echo "${marker}"`) || line.includes(`"${marker}"`);
    const hasEchoPattern = line.includes('echo ""') && hasExitCapture;
    return hasExitCapture || hasMarkerEcho || hasEchoPattern;
  }
}
