import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDestroy = vi.fn();

vi.mock('../../../src/ssh/shell-session.js', () => ({
  ShellSession: vi.fn().mockImplementation(() => ({
    destroy: mockDestroy,
  })),
}));

import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe('ShellRegistry', () => {
  let registry: ShellRegistry;

  beforeEach(() => {
    registry = new ShellRegistry();
    mockDestroy.mockClear();
    vi.mocked(ShellSession).mockClear();
  });

  describe('get', () => {
    it('returns undefined for non-existent serverId', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });

    it('returns shell after set', () => {
      const shell = new ShellSession();
      registry.set('server-1', shell);

      expect(registry.get('server-1')).toBe(shell);
    });
  });

  describe('set', () => {
    it('adds shell to registry', () => {
      const shell = new ShellSession();
      registry.set('server-1', shell);

      expect(registry.has('server-1')).toBe(true);
    });

    it('overwrites existing shell', () => {
      const shell1 = new ShellSession();
      const shell2 = new ShellSession();

      registry.set('server-1', shell1);
      registry.set('server-1', shell2);

      expect(registry.get('server-1')).toBe(shell2);
      expect(registry.size).toBe(1);
    });
  });

  describe('has', () => {
    it('returns false for non-existent serverId', () => {
      expect(registry.has('unknown')).toBe(false);
    });

    it('returns true for existing serverId', () => {
      const shell = new ShellSession();
      registry.set('server-1', shell);

      expect(registry.has('server-1')).toBe(true);
    });
  });

  describe('remove', () => {
    it('returns false for non-existent serverId', () => {
      expect(registry.remove('unknown')).toBe(false);
    });

    it('returns true and removes existing shell', () => {
      const shell = new ShellSession();
      registry.set('server-1', shell);

      const result = registry.remove('server-1');

      expect(result).toBe(true);
      expect(registry.has('server-1')).toBe(false);
    });

    it('calls destroy on removed shell', () => {
      const shell = new ShellSession();
      registry.set('server-1', shell);

      registry.remove('server-1');

      expect(mockDestroy).toHaveBeenCalledOnce();
    });

    it('does not call destroy for non-existent shell', () => {
      registry.remove('unknown');

      expect(mockDestroy).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('removes all shells', () => {
      const shell1 = new ShellSession();
      const shell2 = new ShellSession();
      registry.set('server-1', shell1);
      registry.set('server-2', shell2);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.has('server-1')).toBe(false);
      expect(registry.has('server-2')).toBe(false);
    });

    it('calls destroy on all shells', () => {
      const shell1 = new ShellSession();
      const shell2 = new ShellSession();
      registry.set('server-1', shell1);
      registry.set('server-2', shell2);

      registry.clear();

      expect(mockDestroy).toHaveBeenCalledTimes(2);
    });

    it('handles empty registry', () => {
      expect(() => registry.clear()).not.toThrow();
      expect(registry.size).toBe(0);
    });
  });

  describe('size', () => {
    it('returns 0 for empty registry', () => {
      expect(registry.size).toBe(0);
    });

    it('returns correct count after additions', () => {
      const shell1 = new ShellSession();
      const shell2 = new ShellSession();

      registry.set('server-1', shell1);
      expect(registry.size).toBe(1);

      registry.set('server-2', shell2);
      expect(registry.size).toBe(2);
    });

    it('returns correct count after removal', () => {
      const shell1 = new ShellSession();
      const shell2 = new ShellSession();
      registry.set('server-1', shell1);
      registry.set('server-2', shell2);

      registry.remove('server-1');

      expect(registry.size).toBe(1);
    });
  });
});
