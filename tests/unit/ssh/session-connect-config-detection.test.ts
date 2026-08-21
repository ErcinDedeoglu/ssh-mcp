import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSshConnectConfig } from '../../../src/ssh/session-connect-config.io.js';
import type { ServerConfig } from '../../../src/config/types.js';

vi.mock('node:fs');

const mockOptions = {
  keepaliveIntervalMs: 30000,
  keepaliveCountMax: 3,
  maxReconnectAttempts: 5,
  baseReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  idleTimeoutMs: 900000,
};

function createServerConfig(auth: ServerConfig['auth']): ServerConfig {
  return { id: 'test', host: 'example.com', port: 22, username: 'user', auth };
}

describe('buildSshConnectConfig - privateKey detection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('basic detection', () => {
    it('reads from file when privateKey is a path', () => {
      const fileContent =
        '-----BEGIN OPENSSH PRIVATE KEY-----\nfile\n-----END OPENSSH PRIVATE KEY-----';
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent);

      const config = createServerConfig({ privateKey: '/path/to/key' });
      const result = buildSshConnectConfig(config, mockOptions);

      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/key', 'utf-8');
      expect(result.privateKey).toBe(fileContent);
    });

    it('uses inline content when privateKey starts with -----BEGIN', () => {
      const inlineKey =
        '-----BEGIN OPENSSH PRIVATE KEY-----\ninline\n-----END OPENSSH PRIVATE KEY-----';
      const config = createServerConfig({ privateKey: inlineKey });

      const result = buildSshConnectConfig(config, mockOptions);

      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(result.privateKey).toBe(inlineKey);
    });

    it('includes passphrase when provided', () => {
      const inlineKey = '-----BEGIN RSA PRIVATE KEY-----\nenc\n-----END RSA PRIVATE KEY-----';
      const config = createServerConfig({ privateKey: inlineKey, passphrase: 'secret' });

      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.passphrase).toBe('secret');
    });
  });

  describe('key formats (inline detection)', () => {
    const formats = [
      { name: 'OPENSSH', header: '-----BEGIN OPENSSH PRIVATE KEY-----' },
      { name: 'RSA', header: '-----BEGIN RSA PRIVATE KEY-----' },
      { name: 'EC', header: '-----BEGIN EC PRIVATE KEY-----' },
      { name: 'DSA', header: '-----BEGIN DSA PRIVATE KEY-----' },
      { name: 'ENCRYPTED PKCS#8', header: '-----BEGIN ENCRYPTED PRIVATE KEY-----' },
      { name: 'PRIVATE KEY', header: '-----BEGIN PRIVATE KEY-----' },
    ];

    formats.forEach(({ name, header }) => {
      it(`detects ${name} format as inline`, () => {
        const key = `${header}\ncontent\n-----END ${header.replace('-----BEGIN ', '')}`;
        const config = createServerConfig({ privateKey: key });

        const result = buildSshConnectConfig(config, mockOptions);

        expect(fs.readFileSync).not.toHaveBeenCalled();
        expect(result.privateKey).toBe(key);
      });
    });
  });

  describe('file path patterns (read from disk)', () => {
    beforeEach(() => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        '-----BEGIN OPENSSH PRIVATE KEY-----\nm\n-----END OPENSSH PRIVATE KEY-----',
      );
    });

    const paths = [
      '/home/user/.ssh/id_rsa',
      '~/.ssh/id_rsa',
      './keys/mykey',
      'C:\\Users\\user\\.ssh\\id_rsa',
    ];

    paths.forEach((keyPath) => {
      it(`reads ${keyPath} as file path`, () => {
        const config = createServerConfig({ privateKey: keyPath });
        buildSshConnectConfig(config, mockOptions);

        // ~-prefixed paths are home-expanded before hitting the disk
        const expectedDiskPath = keyPath.startsWith('~/')
          ? path.join(os.homedir(), keyPath.slice(1))
          : keyPath;
        expect(fs.readFileSync).toHaveBeenCalledWith(expectedDiskPath, 'utf-8');
      });
    });
  });

  describe('key alias resolution', () => {
    const inlineKey =
      '-----BEGIN OPENSSH PRIVATE KEY-----\nalias-resolved\n-----END OPENSSH PRIVATE KEY-----';

    it('resolves alias from keys map', () => {
      const config = createServerConfig({ privateKey: 'main-key' });
      const optionsWithKeys = { ...mockOptions, keys: { 'main-key': inlineKey } };

      const result = buildSshConnectConfig(config, optionsWithKeys);

      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(result.privateKey).toBe(inlineKey);
    });

    it('resolves alias to file path', () => {
      const fileContent =
        '-----BEGIN OPENSSH PRIVATE KEY-----\nfromfile\n-----END OPENSSH PRIVATE KEY-----';
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent);

      const config = createServerConfig({ privateKey: 'my-key' });
      const optionsWithKeys = { ...mockOptions, keys: { 'my-key': '/path/to/key' } };

      const result = buildSshConnectConfig(config, optionsWithKeys);

      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/key', 'utf-8');
      expect(result.privateKey).toBe(fileContent);
    });

    it('resolves chained aliases', () => {
      const config = createServerConfig({ privateKey: 'alias1' });
      const optionsWithKeys = {
        ...mockOptions,
        keys: { alias1: 'alias2', alias2: inlineKey },
      };

      const result = buildSshConnectConfig(config, optionsWithKeys);

      expect(result.privateKey).toBe(inlineKey);
    });

    it('falls back to file path when alias not found', () => {
      const fileContent =
        '-----BEGIN OPENSSH PRIVATE KEY-----\nfb\n-----END OPENSSH PRIVATE KEY-----';
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent);

      const config = createServerConfig({ privateKey: 'not-an-alias' });
      const optionsWithKeys = { ...mockOptions, keys: { 'other-key': inlineKey } };

      const result = buildSshConnectConfig(config, optionsWithKeys);

      expect(fs.readFileSync).toHaveBeenCalledWith('not-an-alias', 'utf-8');
      expect(result.privateKey).toBe(fileContent);
    });

    it('works without keys option (backward compatibility)', () => {
      const fileContent =
        '-----BEGIN OPENSSH PRIVATE KEY-----\nbc\n-----END OPENSSH PRIVATE KEY-----';
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent);

      const config = createServerConfig({ privateKey: '/path/to/key' });

      const result = buildSshConnectConfig(config, mockOptions);

      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/key', 'utf-8');
      expect(result.privateKey).toBe(fileContent);
    });
  });
});
