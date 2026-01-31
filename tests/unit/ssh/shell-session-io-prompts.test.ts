import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { waitForInitialPrompt, waitForMcpPrompt } from '../../../src/ssh/shell-session.io.js';
import { MCP_PROMPT, type ShellStream } from '../../../src/ssh/shell-session.types.js';

describe('waitForInitialPrompt', () => {
  let mockStream: ShellStream;

  beforeEach(() => {
    mockStream = new EventEmitter() as ShellStream;
  });

  it('waits for $ prompt', async () => {
    const promise = waitForInitialPrompt(mockStream, 5000);

    mockStream.emit('data', Buffer.from('user@host:~$ '));

    await expect(promise).resolves.toBeUndefined();
  });

  it('waits for # prompt (root)', async () => {
    const promise = waitForInitialPrompt(mockStream, 5000);

    mockStream.emit('data', Buffer.from('root@host:~# '));

    await expect(promise).resolves.toBeUndefined();
  });

  it('waits for > prompt', async () => {
    const promise = waitForInitialPrompt(mockStream, 5000);

    mockStream.emit('data', Buffer.from('C:\\Users\\test> '));

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects on timeout', async () => {
    vi.useFakeTimers();

    const promise = waitForInitialPrompt(mockStream, 1000);

    mockStream.emit('data', Buffer.from('no prompt here'));

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('Timeout waiting for shell prompt');

    vi.useRealTimers();
  });

  it('handles prompt with trailing whitespace', async () => {
    const promise = waitForInitialPrompt(mockStream, 5000);

    mockStream.emit('data', Buffer.from('user@host:~$   \n'));

    await expect(promise).resolves.toBeUndefined();
  });
});

describe('waitForMcpPrompt', () => {
  let mockStream: ShellStream;

  beforeEach(() => {
    mockStream = new EventEmitter() as ShellStream;
  });

  it('waits for MCP_PROMPT', async () => {
    const promise = waitForMcpPrompt(mockStream, 5000);

    mockStream.emit('data', Buffer.from(`${MCP_PROMPT} `));

    await expect(promise).resolves.toBeUndefined();
  });

  it('waits for MCP_PROMPT with trailing whitespace', async () => {
    const promise = waitForMcpPrompt(mockStream, 5000);

    mockStream.emit('data', Buffer.from(`${MCP_PROMPT}  \n`));

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects on timeout', async () => {
    vi.useFakeTimers();

    const promise = waitForMcpPrompt(mockStream, 1000);

    mockStream.emit('data', Buffer.from('wrong prompt$ '));

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('Timeout waiting for shell prompt');

    vi.useRealTimers();
  });

  it('handles MCP_PROMPT in middle of output', async () => {
    const promise = waitForMcpPrompt(mockStream, 5000);

    mockStream.emit('data', Buffer.from('some output\n'));
    mockStream.emit('data', Buffer.from(`${MCP_PROMPT} `));

    await expect(promise).resolves.toBeUndefined();
  });

  it('does not match partial MCP_PROMPT', async () => {
    vi.useFakeTimers();

    const promise = waitForMcpPrompt(mockStream, 1000);

    const partialPrompt = MCP_PROMPT.substring(0, MCP_PROMPT.length - 2);
    mockStream.emit('data', Buffer.from(partialPrompt));

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('Timeout waiting for shell prompt');

    vi.useRealTimers();
  });
});
