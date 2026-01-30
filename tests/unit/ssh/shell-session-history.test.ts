import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ShellHistory } from '../../../src/ssh/shell-session-history.js';

describe('ShellHistory', () => {
  let history: ShellHistory;

  beforeEach(() => {
    vi.useFakeTimers();
    history = new ShellHistory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('record', () => {
    it('records a command with output and exit code', () => {
      history.startCommand();
      vi.advanceTimersByTime(100);
      history.record('echo hello', 'hello', 0);

      const entries = history.get();
      expect(entries).toHaveLength(1);
      expect(entries[0].command).toBe('echo hello');
      expect(entries[0].stdout).toBe('hello');
      expect(entries[0].exitCode).toBe(0);
    });

    it('calculates duration from startCommand', () => {
      history.startCommand();
      vi.advanceTimersByTime(500);
      history.record('sleep 1', 'done', 0);

      const entries = history.get();
      expect(entries[0].durationMs).toBe(500);
    });

    it('records timestamp', () => {
      const now = new Date('2025-01-30T12:00:00Z');
      vi.setSystemTime(now);

      history.startCommand();
      history.record('date', 'output', 0);

      const entries = history.get();
      expect(entries[0].timestamp).toBe('2025-01-30T12:00:00.000Z');
    });
  });

  describe('get', () => {
    it('returns empty array when no history', () => {
      expect(history.get()).toEqual([]);
    });

    it('returns all entries when no limit', () => {
      history.startCommand();
      history.record('cmd1', 'out1', 0);
      history.startCommand();
      history.record('cmd2', 'out2', 0);
      history.startCommand();
      history.record('cmd3', 'out3', 0);

      const entries = history.get();
      expect(entries).toHaveLength(3);
    });

    it('returns empty array when limit is 0', () => {
      history.startCommand();
      history.record('cmd1', 'out1', 0);

      expect(history.get(0)).toEqual([]);
    });

    it('limits entries when limit specified', () => {
      history.startCommand();
      history.record('cmd1', 'out1', 0);
      history.startCommand();
      history.record('cmd2', 'out2', 0);
      history.startCommand();
      history.record('cmd3', 'out3', 0);

      const entries = history.get(2);
      expect(entries).toHaveLength(2);
      expect(entries[0].command).toBe('cmd2');
      expect(entries[1].command).toBe('cmd3');
    });

    it('returns copies of entries (immutable)', () => {
      history.startCommand();
      history.record('cmd1', 'out1', 0);

      const entries1 = history.get();
      const entries2 = history.get();

      expect(entries1[0]).not.toBe(entries2[0]);
      expect(entries1[0]).toEqual(entries2[0]);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      history.startCommand();
      history.record('cmd1', 'out1', 0);
      history.startCommand();
      history.record('cmd2', 'out2', 0);

      history.clear();

      expect(history.get()).toEqual([]);
    });
  });

  describe('max entries limit', () => {
    it('removes oldest entries when exceeding max', () => {
      for (let i = 0; i < 105; i++) {
        history.startCommand();
        history.record(`cmd${i}`, `out${i}`, 0);
      }

      const entries = history.get();
      expect(entries).toHaveLength(100);
      expect(entries[0].command).toBe('cmd5');
      expect(entries[99].command).toBe('cmd104');
    });
  });

  describe('output truncation', () => {
    it('truncates large outputs', () => {
      const largeOutput = 'x'.repeat(60000);
      history.startCommand();
      history.record('big-command', largeOutput, 0);

      const entries = history.get();
      expect(entries[0].stdout.length).toBeLessThan(largeOutput.length);
      expect(entries[0].stdout).toContain('... (truncated)');
    });

    it('preserves small outputs without truncation', () => {
      const smallOutput = 'hello world';
      history.startCommand();
      history.record('echo', smallOutput, 0);

      const entries = history.get();
      expect(entries[0].stdout).toBe(smallOutput);
    });
  });

  describe('multiple commands', () => {
    it('records commands in order', () => {
      history.startCommand();
      vi.advanceTimersByTime(10);
      history.record('first', 'out1', 0);

      history.startCommand();
      vi.advanceTimersByTime(20);
      history.record('second', 'out2', 1);

      history.startCommand();
      vi.advanceTimersByTime(30);
      history.record('third', 'out3', 0);

      const entries = history.get();
      expect(entries[0].command).toBe('first');
      expect(entries[0].durationMs).toBe(10);
      expect(entries[1].command).toBe('second');
      expect(entries[1].durationMs).toBe(20);
      expect(entries[1].exitCode).toBe(1);
      expect(entries[2].command).toBe('third');
      expect(entries[2].durationMs).toBe(30);
    });
  });
});
