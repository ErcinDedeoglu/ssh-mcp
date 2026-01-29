// Config type guard tests: isPasswordAuth and isPrivateKeyAuth functions.
import { describe, it, expect } from 'vitest';
import type { Auth } from '../../../src/config/types.js';
import { isPasswordAuth, isPrivateKeyAuth } from '../../../src/config/types.js';

describe('isPasswordAuth', () => {
  it('returns true for password auth object', () => {
    const auth: Auth = { password: 'secret123' };
    expect(isPasswordAuth(auth)).toBe(true);
  });

  it('returns false for private key auth object', () => {
    const auth: Auth = { privateKey: '/path/to/key' };
    expect(isPasswordAuth(auth)).toBe(false);
  });

  it('returns false for private key auth with passphrase', () => {
    const auth: Auth = { privateKey: '/path/to/key', passphrase: 'keypass' };
    expect(isPasswordAuth(auth)).toBe(false);
  });
});

describe('isPrivateKeyAuth', () => {
  it('returns true for private key auth object', () => {
    const auth: Auth = { privateKey: '/path/to/key' };
    expect(isPrivateKeyAuth(auth)).toBe(true);
  });

  it('returns true for private key auth with passphrase', () => {
    const auth: Auth = { privateKey: '/path/to/key', passphrase: 'keypass' };
    expect(isPrivateKeyAuth(auth)).toBe(true);
  });

  it('returns false for password auth object', () => {
    const auth: Auth = { password: 'secret123' };
    expect(isPrivateKeyAuth(auth)).toBe(false);
  });
});
