import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeCommand, type WriteCommandOptions } from '../../../src/ssh/shell-session-writer.js';
import { STDIN_DELIVERY_DELAY_MS } from '../../../src/ssh/shell-session.types.js';
import type { ShellAdapter } from '../../../src/ssh/shell-adapter.js';

function createMockStream() {
  return { write: vi.fn() } as unknown as WriteCommandOptions['stream'];
}

function createMockAdapter(overrides?: Partial<ShellAdapter>): ShellAdapter {
  return {
    shellType: 'posix',
    eofChar: '\x04',
    lineEnding: '\n',
    exitCommand: 'exit',
    buildInitCommands: () => '',
    wrapCommand: vi.fn((cmd: string, marker: string) => `WRAPPED[${cmd}|${marker}]\n`),
    isEchoedCommandLine: () => false,
    ...overrides,
  };
}

describe('writeCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('writes the wrapped command to the stream', () => {
    const stream = createMockStream();
    const adapter = createMockAdapter();
    writeCommand({ stream, adapter, command: 'ls', marker: 'M1', isAlive: () => true });
    expect(adapter.wrapCommand).toHaveBeenCalledWith('ls', 'M1');
    expect(stream.write).toHaveBeenCalledWith('WRAPPED[ls|M1]\n');
  });

  it('does not write stdin when not provided', () => {
    const stream = createMockStream();
    const adapter = createMockAdapter();
    writeCommand({ stream, adapter, command: 'ls', marker: 'M1', isAlive: () => true });
    vi.advanceTimersByTime(STDIN_DELIVERY_DELAY_MS + 50);
    // Only one write call: the wrapped command
    expect(stream.write).toHaveBeenCalledTimes(1);
  });

  it('delivers stdin after delay with trailing newline and EOF', () => {
    const stream = createMockStream();
    const adapter = createMockAdapter();
    writeCommand({
      stream,
      adapter,
      command: 'cat',
      marker: 'M2',
      stdin: 'hello',
      isAlive: () => true,
    });
    // Before delay: only the wrapped command was written
    expect(stream.write).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(STDIN_DELIVERY_DELAY_MS);
    // After delay: stdin (with appended \n) + EOF
    expect(stream.write).toHaveBeenCalledTimes(3);
    expect(stream.write).toHaveBeenNthCalledWith(2, 'hello\n');
    expect(stream.write).toHaveBeenNthCalledWith(3, '\x04');
  });

  it('does not append extra newline when stdin already ends with one', () => {
    const stream = createMockStream();
    const adapter = createMockAdapter();
    writeCommand({
      stream,
      adapter,
      command: 'cat',
      marker: 'M3',
      stdin: 'data\n',
      isAlive: () => true,
    });
    vi.advanceTimersByTime(STDIN_DELIVERY_DELAY_MS);
    expect(stream.write).toHaveBeenNthCalledWith(2, 'data\n');
  });

  it('skips stdin delivery when isAlive returns false', () => {
    const stream = createMockStream();
    const adapter = createMockAdapter();
    let alive = true;
    writeCommand({
      stream,
      adapter,
      command: 'cat',
      marker: 'M4',
      stdin: 'input',
      isAlive: () => alive,
    });
    alive = false;
    vi.advanceTimersByTime(STDIN_DELIVERY_DELAY_MS);
    // Only the initial wrapped command, no stdin delivery
    expect(stream.write).toHaveBeenCalledTimes(1);
  });

  it('uses adapter eofChar for Windows shells', () => {
    const stream = createMockStream();
    const adapter = createMockAdapter({ eofChar: '\x1A' });
    writeCommand({
      stream,
      adapter,
      command: 'type con',
      marker: 'M5',
      stdin: 'win-input',
      isAlive: () => true,
    });
    vi.advanceTimersByTime(STDIN_DELIVERY_DELAY_MS);
    expect(stream.write).toHaveBeenNthCalledWith(3, '\x1A');
  });
});
