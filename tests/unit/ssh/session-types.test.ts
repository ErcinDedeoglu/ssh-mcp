import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import {
  calculateReconnectDelay,
  safeEmitError,
  DEFAULT_KEEPALIVE_INTERVAL_MS,
  DEFAULT_KEEPALIVE_COUNT_MAX,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_RECONNECT_ATTEMPTS,
  DEFAULT_BASE_RECONNECT_DELAY_MS,
  DEFAULT_MAX_RECONNECT_DELAY_MS,
  DEFAULT_CONNECTION_TIMEOUT_SECONDS,
  MS_PER_SECOND,
} from '../../../src/ssh/session.types.js';

describe('session.types constants', () => {
  it('DEFAULT_KEEPALIVE_INTERVAL_MS is 30 seconds', () => {
    expect(DEFAULT_KEEPALIVE_INTERVAL_MS).toBe(30000);
  });

  it('DEFAULT_KEEPALIVE_COUNT_MAX is 3', () => {
    expect(DEFAULT_KEEPALIVE_COUNT_MAX).toBe(3);
  });

  it('DEFAULT_IDLE_TIMEOUT_MS is 15 minutes', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });

  it('DEFAULT_MAX_RECONNECT_ATTEMPTS is 5', () => {
    expect(DEFAULT_MAX_RECONNECT_ATTEMPTS).toBe(5);
  });

  it('DEFAULT_BASE_RECONNECT_DELAY_MS is 1 second', () => {
    expect(DEFAULT_BASE_RECONNECT_DELAY_MS).toBe(1000);
  });

  it('DEFAULT_MAX_RECONNECT_DELAY_MS is 30 seconds', () => {
    expect(DEFAULT_MAX_RECONNECT_DELAY_MS).toBe(30000);
  });

  it('DEFAULT_CONNECTION_TIMEOUT_SECONDS is 10', () => {
    expect(DEFAULT_CONNECTION_TIMEOUT_SECONDS).toBe(10);
  });

  it('MS_PER_SECOND is 1000', () => {
    expect(MS_PER_SECOND).toBe(1000);
  });
});

describe('calculateReconnectDelay', () => {
  const baseDelay = 1000;
  const maxDelay = 30000;

  it('returns base delay on first attempt', () => {
    expect(calculateReconnectDelay(1, baseDelay, maxDelay)).toBe(1000);
  });

  it('doubles delay on second attempt', () => {
    expect(calculateReconnectDelay(2, baseDelay, maxDelay)).toBe(2000);
  });

  it('quadruples delay on third attempt', () => {
    expect(calculateReconnectDelay(3, baseDelay, maxDelay)).toBe(4000);
  });

  it('follows exponential pattern (2^(n-1))', () => {
    expect(calculateReconnectDelay(4, baseDelay, maxDelay)).toBe(8000);
    expect(calculateReconnectDelay(5, baseDelay, maxDelay)).toBe(16000);
  });

  it('caps at maxDelay when exponential exceeds it', () => {
    expect(calculateReconnectDelay(6, baseDelay, maxDelay)).toBe(30000);
    expect(calculateReconnectDelay(10, baseDelay, maxDelay)).toBe(30000);
  });

  it('works with custom base delay', () => {
    expect(calculateReconnectDelay(1, 500, maxDelay)).toBe(500);
    expect(calculateReconnectDelay(2, 500, maxDelay)).toBe(1000);
    expect(calculateReconnectDelay(3, 500, maxDelay)).toBe(2000);
  });

  it('works with custom max delay', () => {
    expect(calculateReconnectDelay(5, baseDelay, 10000)).toBe(10000);
  });

  it('handles edge case where base equals max', () => {
    expect(calculateReconnectDelay(1, 5000, 5000)).toBe(5000);
    expect(calculateReconnectDelay(5, 5000, 5000)).toBe(5000);
  });

  it('handles very large attempt numbers', () => {
    expect(calculateReconnectDelay(100, baseDelay, maxDelay)).toBe(30000);
  });
});

describe('safeEmitError', () => {
  it('emits error when listener is attached', () => {
    const emitter = new EventEmitter();
    const errorHandler = vi.fn();
    emitter.on('error', errorHandler);

    const testError = new Error('test error');
    safeEmitError(emitter, testError);

    expect(errorHandler).toHaveBeenCalledOnce();
    expect(errorHandler).toHaveBeenCalledWith(testError);
  });

  it('does not throw when no listener is attached', () => {
    const emitter = new EventEmitter();
    const testError = new Error('test error');

    expect(() => safeEmitError(emitter, testError)).not.toThrow();
  });

  it('emits to multiple listeners', () => {
    const emitter = new EventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    emitter.on('error', handler1);
    emitter.on('error', handler2);

    const testError = new Error('test error');
    safeEmitError(emitter, testError);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('passes error object unchanged', () => {
    const emitter = new EventEmitter();
    let receivedError: Error | undefined;
    emitter.on('error', (err) => {
      receivedError = err;
    });

    const testError = new Error('specific message');
    testError.name = 'CustomError';
    safeEmitError(emitter, testError);

    expect(receivedError).toBe(testError);
    expect(receivedError?.message).toBe('specific message');
    expect(receivedError?.name).toBe('CustomError');
  });
});
