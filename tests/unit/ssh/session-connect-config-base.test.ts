import { describe, it, expect } from 'vitest';
import { buildSshConnectConfig } from '../../../src/ssh/session-connect-config.io.js';
import type { ServerConfig } from '../../../src/config/types.js';

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

describe('buildSshConnectConfig - base config', () => {
  describe('password auth', () => {
    it('passes password directly', () => {
      const config = createServerConfig({ password: 'mypassword' });
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.password).toBe('mypassword');
      expect(result.privateKey).toBeUndefined();
    });
  });

  describe('base config properties', () => {
    it('includes host, port, username', () => {
      const config = createServerConfig({ password: 'pass' });
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.host).toBe('example.com');
      expect(result.port).toBe(22);
      expect(result.username).toBe('user');
    });

    it('includes keepalive settings', () => {
      const config = createServerConfig({ password: 'pass' });
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.keepaliveInterval).toBe(30000);
      expect(result.keepaliveCountMax).toBe(3);
    });

    it('uses custom connection timeout from server config', () => {
      const config: ServerConfig = {
        ...createServerConfig({ password: 'pass' }),
        timeouts: { connection: 30 },
      };
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.readyTimeout).toBe(30000);
    });
  });
});
