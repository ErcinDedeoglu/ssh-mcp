import { describe, it, expect } from 'vitest';
import { parseMarkedOutput, MCP_PROMPT } from '../../../src/ssh/shell-session.types.js';

describe('parseMarkedOutput', () => {
  describe('basic parsing', () => {
    it('parses output before marker', () => {
      const buffer = 'hello world\n__MARKER__\n0\n__MCP_PROMPT__';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result).not.toBeNull();
      expect(result!.output).toBe('hello world');
      expect(result!.exitCode).toBe(0);
    });

    it('returns null if marker not found', () => {
      const buffer = 'hello world\nno marker here';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result).toBeNull();
    });

    it('extracts non-zero exit code', () => {
      const buffer = 'error output\n__MARKER__\n42\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.exitCode).toBe(42);
    });

    it('strips ANSI codes from output', () => {
      const buffer = '\x1B[32mgreen\x1B[0m output\n__MARKER__\n0\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.output).toBe('green output');
    });

    it('handles empty output', () => {
      const buffer = '__MARKER__\n0\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.output).toBe('');
      expect(result!.exitCode).toBe(0);
    });

    it('handles output with newlines', () => {
      const buffer = 'line1\nline2\nline3\n__MARKER__\n0\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.output).toBe('line1\nline2\nline3');
    });
  });

  describe('partial buffer handling', () => {
    it('returns null when marker present but exit code missing', () => {
      const buffer = 'output\n__MARKER__\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result).toBeNull();
    });

    it('returns null when marker present but only whitespace after', () => {
      const buffer = 'output\n__MARKER__\n   \n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result).toBeNull();
    });
  });

  describe('echoed command filtering', () => {
    it('ignores marker inside echoed command line', () => {
      const marker = '__MCP_END_test123_abc456__';
      const buffer = `echo "${marker}"; __MCP_EXIT=$?\nactual output\n${marker}\n0\n`;
      const result = parseMarkedOutput(buffer, marker);
      expect(result).not.toBeNull();
      expect(result!.output).toBe('actual output');
    });

    it('filters lines containing __MCP_EXIT variable capture', () => {
      const buffer = `__MCP_EXIT=$?\necho $__MCP_EXIT\nreal output\n__MARKER__\n0\n`;
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.output).toBe('real output');
    });
  });

  describe('line ending handling', () => {
    it('handles CRLF line endings', () => {
      const buffer = 'line1\r\nline2\r\n__MARKER__\r\n0\r\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result).not.toBeNull();
      expect(result!.output).toBe('line1\r\nline2');
    });

    it('handles marker at start of buffer', () => {
      const buffer = '__MARKER__\n0\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result).not.toBeNull();
      expect(result!.output).toBe('');
      expect(result!.exitCode).toBe(0);
    });
  });

  describe('exit code parsing', () => {
    it('handles large exit codes', () => {
      const buffer = 'output\n__MARKER__\n255\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.exitCode).toBe(255);
    });

    it('handles exit code 127 (command not found)', () => {
      const buffer = 'bash: nonexistent: command not found\n__MARKER__\n127\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.exitCode).toBe(127);
      expect(result!.output).toBe('bash: nonexistent: command not found');
    });

    it('handles exit code 1 (general error)', () => {
      const buffer = 'grep: file.txt: No such file\n__MARKER__\n1\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.exitCode).toBe(1);
    });

    it('handles whitespace before exit code', () => {
      const buffer = 'output\n__MARKER__\n  42\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.exitCode).toBe(42);
    });

    it('handles newlines before exit code', () => {
      const buffer = 'output\n__MARKER__\n\n0\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.exitCode).toBe(0);
    });
  });

  describe('remaining buffer handling', () => {
    it('returns remaining buffer content after exit code', () => {
      const buffer = 'output\n__MARKER__\n0\nmore stuff';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result).not.toBeNull();
      expect(result!.remaining).toBe('more stuff');
    });

    it('strips MCP_PROMPT from remaining content', () => {
      const buffer = `output\n__MARKER__\n0\n${MCP_PROMPT}`;
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.remaining).toBe('');
    });
  });

  describe('multiple markers', () => {
    it('handles multiple markers - only parses first standalone', () => {
      const marker = '__MARKER__';
      const buffer = `echo "${marker}"\noutput\n${marker}\n0\n${marker}\n5\n`;
      const result = parseMarkedOutput(buffer, marker);
      expect(result).not.toBeNull();
      expect(result!.exitCode).toBe(0);
    });

    it('handles output containing marker-like strings', () => {
      const buffer = 'text with __MCP_END_ in it\n__MARKER__\n0\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.output).toBe('text with __MCP_END_ in it');
    });
  });

  describe('ANSI and control sequence handling', () => {
    it('handles complex ANSI sequences with output parsing', () => {
      const buffer = '\x1B[1;32mbold green\x1B[0m\n\x1B[4munderline\x1B[0m\n__MARKER__\n0\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.output).toBe('bold green\nunderline');
    });

    it('handles OSC sequences in output', () => {
      const buffer = '\x1B]0;title\x07output text\n__MARKER__\n0\n';
      const result = parseMarkedOutput(buffer, '__MARKER__');
      expect(result!.output).toBe('output text');
    });
  });
});
