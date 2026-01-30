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

describe('ShellSession stdin support', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockEnd.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes stdin content followed by EOF when stdin is provided', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');

    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    mockWrite.mockClear();
    const executePromise = session.execute('cat > /tmp/test.txt', { stdin: 'hello world' });

    const commandWrite = mockWrite.mock.calls[0][0];
    expect(commandWrite).toContain('cat > /tmp/test.txt');

    const stdinWrite = mockWrite.mock.calls[1][0];
    expect(stdinWrite).toBe('hello world\n');

    const eofWrite = mockWrite.mock.calls[2][0];
    expect(eofWrite).toBe('\x04');

    const marker = commandWrite.match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];
    mockStream.emit('data', Buffer.from(`\n${marker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
  });

  it('appends newline to stdin content if not present', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');

    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    mockWrite.mockClear();
    const executePromise = session.execute('cat', { stdin: 'no trailing newline' });

    const stdinWrite = mockWrite.mock.calls[1][0];
    expect(stdinWrite).toBe('no trailing newline\n');

    const marker = mockWrite.mock.calls[0][0].match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];
    mockStream.emit('data', Buffer.from(`no trailing newline\n${marker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
  });

  it('preserves existing trailing newline in stdin content', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');

    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    mockWrite.mockClear();
    const executePromise = session.execute('cat', { stdin: 'has newline\n' });

    const stdinWrite = mockWrite.mock.calls[1][0];
    expect(stdinWrite).toBe('has newline\n');

    const marker = mockWrite.mock.calls[0][0].match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];
    mockStream.emit('data', Buffer.from(`has newline\n${marker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
  });

  it('does not write stdin or EOF when stdin is not provided', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');

    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    mockWrite.mockClear();
    const executePromise = session.execute('echo hello');

    expect(mockWrite).toHaveBeenCalledTimes(1);

    const marker = mockWrite.mock.calls[0][0].match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];
    mockStream.emit('data', Buffer.from(`hello\n${marker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('handles multi-line stdin content', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');

    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    const multiLineContent = 'line1\nline2\nline3';
    mockWrite.mockClear();
    const executePromise = session.execute('cat > /tmp/multiline.txt', { stdin: multiLineContent });

    const stdinWrite = mockWrite.mock.calls[1][0];
    expect(stdinWrite).toBe('line1\nline2\nline3\n');

    const eofWrite = mockWrite.mock.calls[2][0];
    expect(eofWrite).toBe('\x04');

    const marker = mockWrite.mock.calls[0][0].match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];
    mockStream.emit('data', Buffer.from(`\n${marker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
  });

  it('handles empty stdin content', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const { MCP_PROMPT } = await import('../../../src/ssh/shell-session.types.js');

    const session = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: null });
    const mockClient = { shell: vi.fn() } as never;
    await session.initialize(mockClient);

    mockWrite.mockClear();
    const executePromise = session.execute('cat', { stdin: '' });

    const stdinWrite = mockWrite.mock.calls[1][0];
    expect(stdinWrite).toBe('\n');

    const eofWrite = mockWrite.mock.calls[2][0];
    expect(eofWrite).toBe('\x04');

    const marker = mockWrite.mock.calls[0][0].match(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/)?.[0];
    mockStream.emit('data', Buffer.from(`\n${marker}\n0\n${MCP_PROMPT}`));

    const result = await executePromise;
    expect(result.exitCode).toBe(0);
  });
});
