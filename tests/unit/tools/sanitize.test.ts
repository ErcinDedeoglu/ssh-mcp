import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import {
  sanitizeError,
  sanitizePath,
  truncateOutput,
  DEFAULT_MAX_OUTPUT_LENGTH,
} from '../../../src/tools/utils.js';

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

describe('truncateOutput', () => {
  it('returns unchanged output when under limit', () => {
    const output = 'short output';
    const result = truncateOutput(output, 100);
    expect(result.text).toBe('short output');
    expect(result.truncated).toBe(false);
    expect(result.originalLength).toBe(12);
  });

  it('returns unchanged output when exactly at limit', () => {
    const output = 'x'.repeat(100);
    const result = truncateOutput(output, 100);
    expect(result.text).toBe(output);
    expect(result.truncated).toBe(false);
    expect(result.originalLength).toBe(100);
  });

  it('truncates output when over limit', () => {
    const output = 'x'.repeat(150);
    const result = truncateOutput(output, 100);
    expect(result.truncated).toBe(true);
    expect(result.originalLength).toBe(150);
    expect(result.text).toContain('x'.repeat(100));
    expect(result.text).toContain('[OUTPUT TRUNCATED: showing 100 of 150 chars]');
  });

  it('includes formatted numbers in truncation notice', () => {
    const output = 'x'.repeat(15000);
    const result = truncateOutput(output, 10000);
    expect(result.text).toContain('10,000');
    expect(result.text).toContain('15,000');
  });

  it('has correct default max output length', () => {
    expect(DEFAULT_MAX_OUTPUT_LENGTH).toBe(10000);
  });
});
