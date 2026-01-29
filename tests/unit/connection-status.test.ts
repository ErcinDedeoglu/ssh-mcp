import { describe, it, expect } from 'vitest';
import { formatDuration } from '../../src/tools/connection-status.js';

describe('formatDuration', () => {
  it('formats milliseconds for values under 1 second', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds for values under 1 minute', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(1500)).toBe('1s');
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(59999)).toBe('59s');
  });

  it('formats minutes and seconds for values under 1 hour', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(3599999)).toBe('59m 59s');
  });

  it('formats hours and minutes for values 1 hour or more', () => {
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(3660000)).toBe('1h 1m');
    expect(formatDuration(7200000)).toBe('2h 0m');
    expect(formatDuration(7380000)).toBe('2h 3m');
  });

  it('handles large values correctly', () => {
    expect(formatDuration(86400000)).toBe('24h 0m');
    expect(formatDuration(90061000)).toBe('25h 1m');
  });
});
