import { describe, it, expect } from 'vitest';
import { createShellAdapter } from '../../../src/ssh/shell-adapter.js';
import { MCP_PROMPT, parseMarkedOutput } from '../../../src/ssh/shell-session.types.js';

describe('PosixShellAdapter', () => {
  const adapter = createShellAdapter('posix');

  it('has correct EOF char and line ending', () => {
    expect(adapter.eofChar).toBe('\x04');
    expect(adapter.lineEnding).toBe('\n');
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

describe('parseMarkedOutput with posix adapter', () => {
  it('parses posix output correctly', () => {
    const adapter = createShellAdapter('posix');
    const marker = '__MCP_END_test_abc__';
    const buffer = `ls -la; __MCP_EXIT=$?; echo ""; echo "${marker}"; echo $__MCP_EXIT\nfile1.txt\n${marker}\n0\n`;
    const result = parseMarkedOutput(buffer, marker, adapter);
    expect(result).not.toBeNull();
    expect(result!.output).toBe('file1.txt');
    expect(result!.exitCode).toBe(0);
  });
});
