import { describe, it, expect } from 'vitest';
import { createShellAdapter } from '../../../src/ssh/shell-adapter.js';

describe('createShellAdapter', () => {
  it('creates posix adapter', () => {
    const adapter = createShellAdapter('posix');
    expect(adapter.shellType).toBe('posix');
  });

  it('creates powershell adapter', () => {
    const adapter = createShellAdapter('powershell');
    expect(adapter.shellType).toBe('powershell');
  });

  it('creates cmd adapter', () => {
    const adapter = createShellAdapter('cmd');
    expect(adapter.shellType).toBe('cmd');
  });
});
