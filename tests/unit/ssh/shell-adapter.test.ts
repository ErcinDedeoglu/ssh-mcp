import { describe, it, expect } from 'vitest';
import { createShellAdapter } from '../../../src/ssh/shell-adapter.js';
import { MCP_PROMPT, parseMarkedOutput } from '../../../src/ssh/shell-session.types.js';

describe('createShellAdapter', () => {
  it('creates posix adapter', () => {
    const adapter = createShellAdapter('posix');
    expect(adapter.shellType).toBe('posix');
  });

  it('creates powershell adapter', () => {
    const adapter = createShellAdapter('powershell');
    expect(adapter.shellType).toBe('powershell');
  });

  it('creates cmd adapter', () => {
    const adapter = createShellAdapter('cmd');
    expect(adapter.shellType).toBe('cmd');
  });
});

describe('PosixShellAdapter', () => {
  const adapter = createShellAdapter('posix');

  it('has correct EOF char', () => {
    expect(adapter.eofChar).toBe('\x04');
  });

  it('buildInitCommands includes PS1 prompt', () => {
    const cmds = adapter.buildInitCommands();
    expect(cmds).toContain(`PS1="${MCP_PROMPT}"`);
    expect(cmds).toContain('TERM=dumb');
    expect(cmds).toContain('stty -echo');
  });

  it('wrapCommand uses semicolon separator and $?', () => {
    const wrapped = adapter.wrapCommand('ls -la', '__MARKER__');
    expect(wrapped).toContain('ls -la;');
    expect(wrapped).toContain('__MCP_EXIT=$?');
    expect(wrapped).toContain('echo "__MARKER__"');
    expect(wrapped).toContain('echo $__MCP_EXIT');
  });

  it('isEchoedCommandLine detects posix wrapper lines', () => {
    expect(adapter.isEchoedCommandLine('__MCP_EXIT=$?', '__M__')).toBe(true);
    expect(adapter.isEchoedCommandLine('echo $__MCP_EXIT', '__M__')).toBe(true);
    expect(adapter.isEchoedCommandLine('echo "__M__"', '__M__')).toBe(true);
    expect(adapter.isEchoedCommandLine('real output', '__M__')).toBe(false);
  });
});

describe('PowerShellAdapter', () => {
  const adapter = createShellAdapter('powershell');

  it('has correct EOF char', () => {
    expect(adapter.eofChar).toBe('\x1A');
  });

  it('buildInitCommands sets prompt function', () => {
    const cmds = adapter.buildInitCommands();
    expect(cmds).toContain(`function prompt { '${MCP_PROMPT}' }`);
    expect(cmds).toContain('$OutputEncoding');
  });

  it('wrapCommand uses $LASTEXITCODE and Write-Host', () => {
    const wrapped = adapter.wrapCommand('hostname', '__MARKER__');
    expect(wrapped).toContain('hostname;');
    expect(wrapped).toContain('$LASTEXITCODE');
    expect(wrapped).toContain('Write-Host "__MARKER__"');
    expect(wrapped).toContain('Write-Host $__MCP_EXIT');
  });

  it('isEchoedCommandLine detects powershell wrapper lines', () => {
    expect(adapter.isEchoedCommandLine('$__MCP_EXIT = $LASTEXITCODE', '__M__')).toBe(true);
    expect(adapter.isEchoedCommandLine('Write-Host "__M__"', '__M__')).toBe(true);
    expect(adapter.isEchoedCommandLine('real output', '__M__')).toBe(false);
  });
});

describe('CmdShellAdapter', () => {
  const adapter = createShellAdapter('cmd');

  it('has correct EOF char', () => {
    expect(adapter.eofChar).toBe('\x1A');
  });

  it('buildInitCommands sets cmd prompt', () => {
    const cmds = adapter.buildInitCommands();
    expect(cmds).toContain(`prompt ${MCP_PROMPT}`);
    expect(cmds).toContain('@echo off');
  });

  it('wrapCommand uses & separator and %ERRORLEVEL%', () => {
    const wrapped = adapter.wrapCommand('dir', '__MARKER__');
    expect(wrapped).toContain('dir &');
    expect(wrapped).toContain('%ERRORLEVEL%');
    expect(wrapped).toContain('echo __MARKER__');
    expect(wrapped).toContain('%__MCP_EXIT%');
  });

  it('isEchoedCommandLine detects cmd wrapper lines', () => {
    expect(adapter.isEchoedCommandLine('set __MCP_EXIT=%ERRORLEVEL%', '__M__')).toBe(true);
    expect(adapter.isEchoedCommandLine('real output', '__M__')).toBe(false);
  });
});

describe('parseMarkedOutput with different adapters', () => {
  it('parses posix output correctly', () => {
    const adapter = createShellAdapter('posix');
    const marker = '__MCP_END_test_abc__';
    const buffer = `ls -la; __MCP_EXIT=$?; echo ""; echo "${marker}"; echo $__MCP_EXIT\nfile1.txt\n${marker}\n0\n`;
    const result = parseMarkedOutput(buffer, marker, adapter);
    expect(result).not.toBeNull();
    expect(result!.output).toBe('file1.txt');
    expect(result!.exitCode).toBe(0);
  });

  it('parses powershell output correctly', () => {
    const adapter = createShellAdapter('powershell');
    const marker = '__MCP_END_test_abc__';
    const buffer = `$__MCP_EXIT = $LASTEXITCODE; Write-Host "${marker}"\nWIN-SERVER\n${marker}\n0\n`;
    const result = parseMarkedOutput(buffer, marker, adapter);
    expect(result).not.toBeNull();
    expect(result!.output).toBe('WIN-SERVER');
    expect(result!.exitCode).toBe(0);
  });

  it('parses cmd output correctly', () => {
    const adapter = createShellAdapter('cmd');
    const marker = '__MCP_END_test_abc__';
    const buffer = `set __MCP_EXIT=%ERRORLEVEL% & echo. & echo ${marker} & call echo %__MCP_EXIT%\nWIN-SERVER\n${marker}\n0\n`;
    const result = parseMarkedOutput(buffer, marker, adapter);
    expect(result).not.toBeNull();
    expect(result!.output).toBe('WIN-SERVER');
    expect(result!.exitCode).toBe(0);
  });
});
