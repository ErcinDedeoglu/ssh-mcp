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
  waitForInitialPrompt: vi.fn().mockResolvedValue(undefined),
  waitForMcpPrompt: vi.fn().mockResolvedValue(undefined),
}));

describe('ShellSession onOutput callback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockEnd.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onOutput callback with each data chunk', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const onOutput = vi.fn();
    void session.execute('echo hello', { onOutput });

    mockStream.emit('data', Buffer.from('chunk1'));
    expect(onOutput).toHaveBeenCalledWith('chunk1');

    mockStream.emit('data', Buffer.from('chunk2'));
    expect(onOutput).toHaveBeenCalledWith('chunk2');

    expect(onOutput).toHaveBeenCalledTimes(2);
  });

  it('calls onOutput with empty string chunks', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const onOutput = vi.fn();
    void session.execute('cmd', { onOutput });

    mockStream.emit('data', Buffer.from(''));
    expect(onOutput).toHaveBeenCalledWith('');
  });

  it('continues execution when onOutput throws', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const onOutput = vi.fn().mockImplementation(() => {
      throw new Error('callback error');
    });

    const executePromise = session.execute('echo hello', { onOutput });

    const marker = mockWrite.mock.calls[mockWrite.mock.calls.length - 1][0];
    const extractedMarker = marker.match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];

    mockStream.emit('data', Buffer.from(`hello\n${extractedMarker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('does not call onOutput when not provided', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const executePromise = session.execute('echo test');

    const marker = mockWrite.mock.calls[mockWrite.mock.calls.length - 1][0];
    const extractedMarker = marker.match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];

    mockStream.emit('data', Buffer.from(`test\n${extractedMarker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
  });

  it('calls onOutput for multiple rapid data chunks', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const chunks: string[] = [];
    const onOutput = vi.fn((chunk: string) => chunks.push(chunk));
    void session.execute('cmd', { onOutput });

    for (let i = 0; i < 100; i++) {
      mockStream.emit('data', Buffer.from(`line${i}\n`));
    }

    expect(chunks).toHaveLength(100);
    expect(chunks[0]).toBe('line0\n');
    expect(chunks[99]).toBe('line99\n');
  });

  it('calls onOutput for large data chunks', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const onOutput = vi.fn();
    void session.execute('cmd', { onOutput });

    const largeChunk = 'x'.repeat(100000);
    mockStream.emit('data', Buffer.from(largeChunk));

    expect(onOutput).toHaveBeenCalledWith(largeChunk);
    expect(onOutput.mock.calls[0][0].length).toBe(100000);
  });

  it('stops calling onOutput after command completes', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const onOutput = vi.fn();
    const executePromise = session.execute('echo done', { onOutput });

    const marker = mockWrite.mock.calls[mockWrite.mock.calls.length - 1][0];
    const extractedMarker = marker.match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];

    mockStream.emit('data', Buffer.from(`done\n${extractedMarker}\n0\n${MCP_PROMPT}`));

    await executePromise;
    const callCountAfterComplete = onOutput.mock.calls.length;

    mockStream.emit('data', Buffer.from('extra data'));

    expect(onOutput.mock.calls.length).toBe(callCountAfterComplete);
  });

  it('calls onOutput with unicode data', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const onOutput = vi.fn();
    void session.execute('cmd', { onOutput });

    mockStream.emit('data', Buffer.from('Hello 世界 🌍'));

    expect(onOutput).toHaveBeenCalledWith('Hello 世界 🌍');
  });
});
