import { describe, it, expect } from 'vitest';
import {
  generateMarker,
  stripControlSequences,
  buildShellInitCommands,
  wrapCommand,
  MCP_PROMPT,
} from '../../../src/ssh/shell-session.types.js';

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
  });

  describe('buildShellInitCommands', () => {
    it('includes PS1 with MCP_PROMPT', () => {
      const init = buildShellInitCommands();
      expect(init).toContain(`PS1="${MCP_PROMPT}"`);
    });

    it('sets TERM to dumb', () => {
      const init = buildShellInitCommands();
      expect(init).toContain('TERM=dumb');
    });
  });

  describe('wrapCommand', () => {
    it('wraps command with exit code capture and marker', () => {
      const wrapped = wrapCommand('ls -la', '__MARKER__');
      expect(wrapped).toContain('ls -la');
      expect(wrapped).toContain('__MCP_EXIT=$?');
      expect(wrapped).toContain('echo "__MARKER__"');
      expect(wrapped).toContain('echo $__MCP_EXIT');
    });
  });
});
