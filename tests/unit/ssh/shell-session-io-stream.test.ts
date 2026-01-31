import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Client } from 'ssh2';
import { createShellStream, waitForPattern } from '../../../src/ssh/shell-session.io.js';
import type { ShellStream } from '../../../src/ssh/shell-session.types.js';

const mockClients = vi.hoisted(() => [] as Array<{ shell: ReturnType<typeof vi.fn> }>);

vi.mock('ssh2', () => ({
  Client: vi.fn(() => {
    const client = { shell: vi.fn() };
    mockClients.push(client);
    return client;
  }),
}));

describe('createShellStream', () => {
  beforeEach(() => {
    mockClients.length = 0;
    vi.clearAllMocks();
  });

  it('resolves with stream on success', async () => {
    const mockStream = new EventEmitter() as ShellStream;
    const mockClient = {
      shell: vi.fn((_ptyOpts, _shellOpts, callback) => {
        callback(null, mockStream);
      }),
    } as unknown as Client;

    const result = await createShellStream(mockClient);

    expect(result).toBe(mockStream);
    expect(mockClient.shell).toHaveBeenCalledWith(
      { term: 'dumb' },
      { agentForward: false },
      expect.any(Function),
    );
  });

  it('rejects with error on failure', async () => {
    const mockError = new Error('Shell creation failed');
    const mockClient = {
      shell: vi.fn((_ptyOpts, _shellOpts, callback) => {
        callback(mockError, null);
      }),
    } as unknown as Client;

    await expect(createShellStream(mockClient)).rejects.toThrow('Shell creation failed');
  });

  it('passes agentForward option to shell', async () => {
    const mockStream = new EventEmitter() as ShellStream;
    const mockClient = {
      shell: vi.fn((_ptyOpts, _shellOpts, callback) => {
        callback(null, mockStream);
      }),
    } as unknown as Client;

    await createShellStream(mockClient, { agentForward: true });

    expect(mockClient.shell).toHaveBeenCalledWith(
      { term: 'dumb' },
      { agentForward: true },
      expect.any(Function),
    );
  });
});

describe('waitForPattern', () => {
  let mockStream: ShellStream;

  beforeEach(() => {
    mockStream = new EventEmitter() as ShellStream;
  });

  it('resolves immediately when pattern matches existing buffer', async () => {
    const pattern = /\$\s*$/;
    const promise = waitForPattern(mockStream, pattern, 5000);

    mockStream.emit('data', Buffer.from('user@host:~$ '));

    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves when pattern matches after multiple data events', async () => {
    const pattern = /complete$/;
    const promise = waitForPattern(mockStream, pattern, 5000);

    mockStream.emit('data', Buffer.from('processing...'));
    mockStream.emit('data', Buffer.from('\n'));
    mockStream.emit('data', Buffer.from('complete'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('accumulates buffer across multiple data events', async () => {
    const pattern = /hello world$/;
    const promise = waitForPattern(mockStream, pattern, 5000);

    mockStream.emit('data', Buffer.from('hello '));
    mockStream.emit('data', Buffer.from('world'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects on timeout', async () => {
    vi.useFakeTimers();

    const pattern = /never-matches$/;
    const promise = waitForPattern(mockStream, pattern, 1000);

    mockStream.emit('data', Buffer.from('some output'));

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('Timeout waiting for shell prompt');

    vi.useRealTimers();
  });

  it('cleans up listeners on success', async () => {
    const pattern = /done$/;

    const initialListenerCount = mockStream.listenerCount('data');
    const promise = waitForPattern(mockStream, pattern, 5000);

    expect(mockStream.listenerCount('data')).toBe(initialListenerCount + 1);

    mockStream.emit('data', Buffer.from('done'));

    await promise;

    expect(mockStream.listenerCount('data')).toBe(initialListenerCount);
  });

  it('cleans up listeners on timeout', async () => {
    vi.useFakeTimers();

    const initialListenerCount = mockStream.listenerCount('data');
    const pattern = /never$/;
    const promise = waitForPattern(mockStream, pattern, 1000);

    expect(mockStream.listenerCount('data')).toBe(initialListenerCount + 1);

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow();

    expect(mockStream.listenerCount('data')).toBe(initialListenerCount);

    vi.useRealTimers();
  });

  it('handles empty data events', async () => {
    const pattern = /test$/;
    const promise = waitForPattern(mockStream, pattern, 5000);

    mockStream.emit('data', Buffer.from(''));
    mockStream.emit('data', Buffer.from('test'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('handles binary data correctly', async () => {
    const pattern = /test\u00FF\u00FE$/;
    const promise = waitForPattern(mockStream, pattern, 5000);

    mockStream.emit('data', Buffer.from('test\u00FF\u00FE'));

    await expect(promise).resolves.toBeUndefined();
  });
});
