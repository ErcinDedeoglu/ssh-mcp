import * as fs from 'node:fs';
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

describe('buildSshConnectConfig - error cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('throws when file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const config = createServerConfig({ privateKey: '/nonexistent/key' });

    expect(() => buildSshConnectConfig(config, mockOptions)).toThrow('ENOENT');
  });

  it('throws when file is not readable', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const config = createServerConfig({ privateKey: '/protected/key' });

    expect(() => buildSshConnectConfig(config, mockOptions)).toThrow('EACCES');
  });
});
