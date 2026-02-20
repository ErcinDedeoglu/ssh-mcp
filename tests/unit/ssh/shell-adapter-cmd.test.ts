import { describe, it, expect } from 'vitest';
import { createShellAdapter } from '../../../src/ssh/shell-adapter.js';
import { MCP_PROMPT, parseMarkedOutput } from '../../../src/ssh/shell-session.types.js';

describe('CmdShellAdapter', () => {
  const adapter = createShellAdapter('cmd');

  it('has correct EOF char and line ending', () => {
    expect(adapter.eofChar).toBe('\x1A');
    expect(adapter.lineEnding).toBe('\r\n');
  });

  it('buildInitCommands sets cmd prompt', () => {
    const cmds = adapter.buildInitCommands();
    expect(cmds).toContain(`prompt ${MCP_PROMPT}`);
  });

  it('wrapCommand uses two lines: command then marker + exit code', () => {
    const wrapped = adapter.wrapCommand('dir', '__MARKER__');
    // Line 1: @command\r\n — runs the command with echo suppressed
    // Line 2: @echo. & echo MARKER & echo %ERRORLEVEL%\r\n — separate parse context
    expect(wrapped).toBe('@dir\r\n@echo. & echo __MARKER__ & echo %ERRORLEVEL%\r\n');
  });

  it('wrapCommand uses two lines for rem/goto/:: with hardcoded exit 0', () => {
    const wrappedRem = adapter.wrapCommand('rem this is a comment', '__MARKER__');
    expect(wrappedRem).toContain('@rem this is a comment\r\n');
    expect(wrappedRem).toContain('echo __MARKER__');
    expect(wrappedRem).toContain('echo 0');
    expect(wrappedRem).not.toContain('ERRORLEVEL');
    const wrappedGoto = adapter.wrapCommand('goto :eof', '__MARKER__');
    expect(wrappedGoto).toContain('@goto :eof\r\n');
  });

  it('isEchoedCommandLine detects cmd wrapper and echoed command lines', () => {
    adapter.wrapCommand('dir', '__M__');
    expect(adapter.isEchoedCommandLine('echo __M__', '__M__')).toBe(true);
    expect(adapter.isEchoedCommandLine('@dir', '__M__', 'dir')).toBe(true);
    expect(adapter.isEchoedCommandLine('real output', '__M__')).toBe(false);
    expect(adapter.isEchoedCommandLine('real output', '__M__', 'dir')).toBe(false);
  });

  it('isEchoedCommandLine catches conhost line-wrapped fragments', () => {
    const longCmd = 'mkdir %TEMP%\\test & echo created & rmdir %TEMP%\\test & echo removed';
    adapter.wrapCommand(longCmd, '__M__');
    // Conhost wraps echoed commands; fragments contain cmd operators (&)
    expect(adapter.isEchoedCommandLine('& echo removed', '__M__', longCmd)).toBe(true);
    expect(
      adapter.isEchoedCommandLine(
        '@mkdir %TEMP%\\test & echo created & rmdir %TEMP%\\test &',
        '__M__',
        longCmd,
      ),
    ).toBe(true);
    // Fragment from mid-line break: "t & del file.txt" contains &
    expect(adapter.isEchoedCommandLine('t & echo removed', '__M__', longCmd)).toBe(true);
    // Actual command output should NOT be filtered (no & operator)
    expect(adapter.isEchoedCommandLine('created', '__M__', longCmd)).toBe(false);
    expect(adapter.isEchoedCommandLine('removed', '__M__', longCmd)).toBe(false);
  });
});

describe('parseMarkedOutput with cmd adapter', () => {
  it('parses cmd output correctly', () => {
    const adapter = createShellAdapter('cmd');
    const marker = '__MCP_END_test_abc__';
    // Two-line wrapper: line 1 is @command, line 2 is marker + exit code
    adapter.wrapCommand('hostname', marker);
    const buffer = `WIN-SERVER\n\n${marker}\n0\n`;
    const result = parseMarkedOutput(buffer, marker, adapter, 'hostname');
    expect(result).not.toBeNull();
    expect(result!.output).toBe('WIN-SERVER');
    expect(result!.exitCode).toBe(0);
  });
});
