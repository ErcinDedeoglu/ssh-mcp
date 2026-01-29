// Tests for sanitizeError and sanitizePath utility functions
import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { sanitizeError, sanitizePath } from '../../../src/tools/utils.js';

describe('sanitizeError', () => {
  it('replaces home directory with ~', () => {
    const homeDir = homedir();
    const error = new Error(`File not found: ${homeDir}/secret/file.txt`);
    const sanitized = sanitizeError(error);
    expect(sanitized).toBe('File not found: ~/secret/file.txt');
    expect(sanitized).not.toContain(homeDir);
  });

  it('redacts password values', () => {
    const error = new Error('Connection failed: password=supersecret123');
    const sanitized = sanitizeError(error);
    expect(sanitized).toBe('Connection failed: password=***');
    expect(sanitized).not.toContain('supersecret123');
  });

  it('redacts privateKey paths', () => {
    const error = new Error('Auth failed: privateKey=/home/user/.ssh/id_rsa');
    const sanitized = sanitizeError(error);
    expect(sanitized).toBe('Auth failed: privateKey=***');
    expect(sanitized).not.toContain('/home/user/.ssh/id_rsa');
  });

  it('redacts passphrase values', () => {
    const error = new Error('Decryption failed: passphrase=mypassphrase');
    const sanitized = sanitizeError(error);
    expect(sanitized).toBe('Decryption failed: passphrase=***');
    expect(sanitized).not.toContain('mypassphrase');
  });

  it('redacts private key content', () => {
    const error = new Error(
      'Key error: -----BEGIN RSA PRIVATE KEY-----\nMIIE...content...\n-----END RSA PRIVATE KEY-----',
    );
    const sanitized = sanitizeError(error);
    expect(sanitized).toBe('Key error: [REDACTED_KEY]');
    expect(sanitized).not.toContain('BEGIN');
    expect(sanitized).not.toContain('PRIVATE KEY');
  });

  it('handles non-Error objects', () => {
    const sanitized = sanitizeError('Simple string error');
    expect(sanitized).toBe('Simple string error');
  });
});

describe('sanitizePath', () => {
  it('replaces home directory with ~', () => {
    const homeDir = homedir();
    const path = `${homeDir}/documents/file.txt`;
    const sanitized = sanitizePath(path);
    expect(sanitized).toBe('~/documents/file.txt');
  });

  it('leaves non-home paths unchanged', () => {
    const path = '/var/log/app.log';
    const sanitized = sanitizePath(path);
    expect(sanitized).toBe('/var/log/app.log');
  });
});
