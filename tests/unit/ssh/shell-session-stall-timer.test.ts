import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockWrite = vi.fn();
const mockEnd = vi.fn();

class MockShellStream extends EventEmitter {
  write = mockWrite;
  end = mockEnd;
  stderr = new EventEmitter();
}

let mockStream: MockShellStream;

vi.mock('../../../src/ssh/shell-session.io.js', () => ({
  createShellStream: vi.fn(() => {
    mockStream = new MockShellStream();
    return Promise.resolve(mockStream);
  }),
  waitForInitialPrompt: vi.fn().mockResolvedValue('user@host:~$ '),
  waitForMcpPrompt: vi.fn().mockResolvedValue('__MCP_PROMPT__'),
}));

describe('ShellSession stall timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockEnd.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses default stall timeout when not specified', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000 });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('sleep 30');

    vi.advanceTimersByTime(10000);

    await expect(executePromise).rejects.toThrow('stalled');
  });

  it('disables stall timer when stallTimeoutMs is null in constructor', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('sleep 30');

    vi.advanceTimersByTime(15000);

    expect(session.hasRunningCommand).toBe(true);

    vi.advanceTimersByTime(60000);
    await expect(executePromise).rejects.toThrow('timed out');
  });

  it('disables stall timer when stallTimeoutMs is 0 in constructor', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 0 });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('sleep 30');

    vi.advanceTimersByTime(15000);

    expect(session.hasRunningCommand).toBe(true);

    vi.advanceTimersByTime(60000);
    await expect(executePromise).rejects.toThrow('timed out');
  });

  it('allows per-command stallTimeout override to disable', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 5000 });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('sleep 30', { stallTimeoutMs: null });

    vi.advanceTimersByTime(10000);

    expect(session.hasRunningCommand).toBe(true);

    vi.advanceTimersByTime(60000);
    await expect(executePromise).rejects.toThrow('timed out');
  });

  it('allows per-command stallTimeout override to 0', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 5000 });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('sleep 30', { stallTimeoutMs: 0 });

    vi.advanceTimersByTime(10000);

    expect(session.hasRunningCommand).toBe(true);

    vi.advanceTimersByTime(60000);
    await expect(executePromise).rejects.toThrow('timed out');
  });

  it('resets stall timer when output received', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 5000 });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    void session.execute('long-command');

    vi.advanceTimersByTime(4000);
    mockStream.emit('data', Buffer.from('partial output\n'));

    vi.advanceTimersByTime(4000);
    mockStream.emit('data', Buffer.from('more output\n'));

    vi.advanceTimersByTime(4000);

    expect(session.hasRunningCommand).toBe(true);
  });

  it('fires stall error when no output for stallTimeout period', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 3000 });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('hanging-command');

    vi.advanceTimersByTime(3000);

    await expect(executePromise).rejects.toThrow('stalled');
    await expect(executePromise).rejects.toThrow('3000ms');
  });

  it('uses per-command stallTimeout value when specified', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 10000 });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('slow-command', { stallTimeoutMs: 2000 });

    vi.advanceTimersByTime(2000);

    await expect(executePromise).rejects.toThrow('stalled');
    await expect(executePromise).rejects.toThrow('2000ms');
  });

  it('clears stall timer when command completes', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');

    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 5000 });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('echo hello');

    const marker = mockWrite.mock.calls[mockWrite.mock.calls.length - 1][0];
    const extractedMarker = marker.match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];

    mockStream.emit('data', Buffer.from(`hello\n${extractedMarker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });
});
