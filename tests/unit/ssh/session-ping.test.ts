import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ping } from '../../../src/ssh/session-ping.io.js';
import type { Client } from 'ssh2';

describe('ping', () => {
  let mockClient: Client;
  let mockStream: EventEmitter;

  beforeEach(() => {
    mockStream = new EventEmitter();
    mockClient = {
      exec: vi.fn(),
    } as unknown as Client;
  });

  it('returns true when exec succeeds and stream closes', async () => {
    vi.mocked(mockClient.exec).mockImplementation((_cmd, cb) => {
      cb(null as unknown as Error, mockStream as never);
      setImmediate(() => mockStream.emit('close'));
      return mockClient;
    });

    const result = await ping(mockClient);
    expect(result).toBe(true);
    expect(mockClient.exec).toHaveBeenCalledWith('true', expect.any(Function));
  });

  it('returns false when exec returns error', async () => {
    vi.mocked(mockClient.exec).mockImplementation((_cmd, cb) => {
      cb(new Error('Connection lost'), null as never);
      return mockClient;
    });

    const result = await ping(mockClient);
    expect(result).toBe(false);
  });

  it('returns false when stream emits error', async () => {
    vi.mocked(mockClient.exec).mockImplementation((_cmd, cb) => {
      cb(null as unknown as Error, mockStream as never);
      setImmediate(() => mockStream.emit('error', new Error('Stream error')));
      return mockClient;
    });

    const result = await ping(mockClient);
    expect(result).toBe(false);
  });

  it('returns false on timeout', async () => {
    vi.mocked(mockClient.exec).mockImplementation(() => mockClient);

    const result = await ping(mockClient, 50);
    expect(result).toBe(false);
  }, 1000);

  it('uses default timeout of 5000ms', async () => {
    vi.mocked(mockClient.exec).mockImplementation((_cmd, cb) => {
      cb(null as unknown as Error, mockStream as never);
      setTimeout(() => mockStream.emit('close'), 100);
      return mockClient;
    });

    const start = Date.now();
    const result = await ping(mockClient);
    const elapsed = Date.now() - start;

    expect(result).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });
});
