import { describe, it, expect, beforeEach, vi } from 'vitest';
import { closeRemoteForward } from '../../../src/ssh/remote-forward.js';
import {
  createMockClient,
  type UnforwardInCallback,
  type MockClientType,
} from './_fixtures/remote-forward-mocks.js';

vi.mock('node:net', () => ({
  connect: vi.fn(),
}));

describe('closeRemoteForward', () => {
  let mockClient: MockClientType;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  describe('success path', () => {
    it('resolves when unforwardIn succeeds', async () => {
      mockClient.unforwardIn.mockImplementation(
        (_rh: string, _bp: number, cb: UnforwardInCallback) => {
          cb(undefined);
        },
      );

      await expect(closeRemoteForward(mockClient, '0.0.0.0', 8080)).resolves.toBeUndefined();

      expect(mockClient.unforwardIn).toHaveBeenCalledWith('0.0.0.0', 8080, expect.any(Function));
    });

    it('resolves when unforwardIn callback receives null', async () => {
      mockClient.unforwardIn.mockImplementation(
        (_rh: string, _bp: number, cb: UnforwardInCallback) => {
          cb(null);
        },
      );

      await expect(closeRemoteForward(mockClient, '127.0.0.1', 9000)).resolves.toBeUndefined();
    });
  });

  describe('error path', () => {
    it('rejects when unforwardIn callback receives error', async () => {
      mockClient.unforwardIn.mockImplementation(
        (_rh: string, _bp: number, cb: UnforwardInCallback) => {
          cb(new Error('Failed to close forward'));
        },
      );

      await expect(closeRemoteForward(mockClient, '0.0.0.0', 8080)).rejects.toThrow(
        'Failed to close forward',
      );
    });

    it('rejects with specific error message', async () => {
      mockClient.unforwardIn.mockImplementation(
        (_rh: string, _bp: number, cb: UnforwardInCallback) => {
          cb(new Error('No such forward'));
        },
      );

      await expect(closeRemoteForward(mockClient, '127.0.0.1', 9999)).rejects.toThrow(
        'No such forward',
      );
    });
  });
});
