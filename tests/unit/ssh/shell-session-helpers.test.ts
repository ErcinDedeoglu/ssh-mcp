import { describe, it, expect } from 'vitest';
import {
  generateMarker,
  stripControlSequences,
  MCP_PROMPT,
} from '../../../src/ssh/shell-session.types.js';
import { createShellAdapter } from '../../../src/ssh/shell-adapter.js';

describe('shell-session helper functions', () => {
  describe('generateMarker', () => {
    it('generates unique markers', () => {
      const m1 = generateMarker();
      const m2 = generateMarker();
      expect(m1).not.toBe(m2);
      expect(m1).toMatch(/^__MCP_END_[a-z0-9]+_[a-z0-9]+__$/);
    });

    it('generates markers with timestamp and random components', () => {
      const marker = generateMarker();
      const parts = marker.match(/^__MCP_END_([a-z0-9]+)_([a-z0-9]+)__$/);
      expect(parts).not.toBeNull();
      expect(parts![1].length).toBeGreaterThan(0);
      expect(parts![2].length).toBeGreaterThan(0);
    });
  });

  describe('stripControlSequences', () => {
    it('removes ANSI escape codes', () => {
      const input = '\x1B[32mgreen text\x1B[0m';
      expect(stripControlSequences(input)).toBe('green text');
    });

    it('preserves text without codes', () => {
      expect(stripControlSequences('plain text')).toBe('plain text');
    });

    it('removes carriage returns not followed by newline', () => {
      const input = 'hello\rworld';
      expect(stripControlSequences(input)).toBe('helloworld');
    });

    it('preserves CRLF sequences', () => {
      const input = 'line1\r\nline2';
      expect(stripControlSequences(input)).toBe('line1\r\nline2');
    });

    it('strips bracketed paste mode sequences', () => {
      const input = 'prompt% \x1B[?2004h';
      expect(stripControlSequences(input)).toBe('prompt% ');
    });

    it('replaces cursor position sequences with newlines', () => {
      const input = 'before\x1B[4;1Hafter';
      expect(stripControlSequences(input)).toBe('before\nafter');
    });

    it('replaces cursor home sequence with newline', () => {
      const input = 'line1\x1B[Hline2';
      expect(stripControlSequences(input)).toBe('line1\nline2');
    });

    it('separates Win32-OpenSSH copyright from prompt via cursor position', () => {
      // Real Windows SSH data: copyright text + ESC[4;1H + prompt
      const input =
        '(c) Microsoft Corporation. All rights reserved.' +
        '\x1B[4;1Hercin@ERCIN-WS C:\\Users\\ercin>';
      const result = stripControlSequences(input);
      expect(result).toContain('\n');
      expect(result).toMatch(/ercin@ERCIN-WS C:\\Users\\ercin>$/);
    });

    it('strips zsh PROMPT_SP preamble with bracketed paste', () => {
      // Real zsh output: PROMPT_SP bold/reverse %, spaces, CR sequences, then actual prompt
      const input =
        '\x1B[1m\x1B[7m%\x1B[27m\x1B[1m\x1B[0m   \r \r\r' +
        '\x1B[0m\x1B[27m\x1B[24m\x1B[J' +
        'user@host ~ % \x1B[K\x1B[?2004h';
      expect(stripControlSequences(input)).toBe('%    user@host ~ % ');
    });
  });

  describe('posix adapter buildInitCommands', () => {
    it('includes PS1 with MCP_PROMPT', () => {
      const adapter = createShellAdapter('posix');
      const init = adapter.buildInitCommands();
      expect(init).toContain(`PS1="${MCP_PROMPT}"`);
    });

    it('sets TERM to dumb', () => {
      const adapter = createShellAdapter('posix');
      const init = adapter.buildInitCommands();
      expect(init).toContain('TERM=dumb');
    });
  });

  describe('posix adapter wrapCommand', () => {
    it('wraps command with exit code capture and marker', () => {
      const adapter = createShellAdapter('posix');
      const wrapped = adapter.wrapCommand('ls -la', '__MARKER__');
      expect(wrapped).toContain('ls -la');
      expect(wrapped).toContain('__MCP_EXIT=$?');
      expect(wrapped).toContain('echo "__MARKER__"');
      expect(wrapped).toContain('echo $__MCP_EXIT');
    });
  });
});
