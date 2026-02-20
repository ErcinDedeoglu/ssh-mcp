import { describe, it, expect } from 'vitest';
import { createShellAdapter } from '../../../src/ssh/shell-adapter.js';
import { MCP_PROMPT, parseMarkedOutput } from '../../../src/ssh/shell-session.types.js';

describe('PowerShellAdapter', () => {
  const adapter = createShellAdapter('powershell');

  it('has correct EOF char and line ending', () => {
    expect(adapter.eofChar).toBe('\x1A');
    expect(adapter.lineEnding).toBe('\r\n');
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

describe('parseMarkedOutput with powershell adapter', () => {
  it('parses powershell output correctly', () => {
    const adapter = createShellAdapter('powershell');
    const marker = '__MCP_END_test_abc__';
    const buffer = `$__MCP_EXIT = $LASTEXITCODE; Write-Host "${marker}"\nWIN-SERVER\n${marker}\n0\n`;
    const result = parseMarkedOutput(buffer, marker, adapter);
    expect(result).not.toBeNull();
    expect(result!.output).toBe('WIN-SERVER');
    expect(result!.exitCode).toBe(0);
  });
});
