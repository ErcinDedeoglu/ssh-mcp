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

  it('wrapCommand uses two lines: @call command then marker + exit code', () => {
    const wrapped = adapter.wrapCommand('dir', '__MARKER__');
    // Line 1: @call command\r\n — call forces ERRORLEVEL update for built-ins
    // Line 2: @echo. & echo MARKER & echo %ERRORLEVEL%\r\n — separate parse context
    expect(wrapped).toBe('@call dir\r\n@echo. & echo __MARKER__ & echo %ERRORLEVEL%\r\n');
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
    expect(adapter.isEchoedCommandLine('@call dir', '__M__', 'dir')).toBe(true);
    expect(adapter.isEchoedCommandLine('real output', '__M__')).toBe(false);
    expect(adapter.isEchoedCommandLine('real output', '__M__', 'dir')).toBe(false);
    // rem/goto use @command (no call) — must also be filtered
    adapter.wrapCommand('rem a comment', '__M__');
    expect(adapter.isEchoedCommandLine('@rem a comment', '__M__', 'rem a comment')).toBe(true);
  });

  it('isEchoedCommandLine catches conhost line-wrapped fragments', () => {
    const longCmd = 'mkdir %TEMP%\\test & echo created & rmdir %TEMP%\\test & echo removed';
    adapter.wrapCommand(longCmd, '__M__');
    // Fragments containing cmd operators (&)
    expect(adapter.isEchoedCommandLine('& echo removed', '__M__', longCmd)).toBe(true);
    expect(
      adapter.isEchoedCommandLine(
        '@call mkdir %TEMP%\\test & echo created & rmdir %TEMP%\\test &',
        '__M__',
        longCmd,
      ),
    ).toBe(true);
    // Fragment with operator from mid-line break
    expect(adapter.isEchoedCommandLine('t & echo removed', '__M__', longCmd)).toBe(true);
    // Partial-word fragment without operators (e.g. "ed" from "created")
    expect(adapter.isEchoedCommandLine('ed', '__M__', longCmd)).toBe(true);
    expect(adapter.isEchoedCommandLine('oved', '__M__', longCmd)).toBe(true);
    // Actual command output (whole words) should NOT be filtered
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
