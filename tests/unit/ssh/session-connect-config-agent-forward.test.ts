// Tests for SSH agent forwarding configuration in buildSshConnectConfig.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

function createServerConfig(auth: ServerConfig['auth'], agentForward?: boolean): ServerConfig {
  return {
    id: 'test',
    host: 'example.com',
    port: 22,
    username: 'user',
    auth,
    ...(agentForward !== undefined && { agentForward }),
  };
}

describe('buildSshConnectConfig - agent forwarding', () => {
  let originalAuthSock: string | undefined;

  beforeEach(() => {
    originalAuthSock = process.env.SSH_AUTH_SOCK;
  });

  afterEach(() => {
    if (originalAuthSock !== undefined) {
      process.env.SSH_AUTH_SOCK = originalAuthSock;
    } else {
      delete process.env.SSH_AUTH_SOCK;
    }
  });

  describe('when agentForward is not set', () => {
    it('enables agentForward when SSH_AUTH_SOCK is available', () => {
      process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';
      const config = createServerConfig({ password: 'secret' });
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.agentForward).toBe(true);
      expect(result.agent).toBe('/tmp/ssh-agent.sock');
    });

    it('disables agentForward when SSH_AUTH_SOCK is not available', () => {
      delete process.env.SSH_AUTH_SOCK;
      const config = createServerConfig({ password: 'secret' });
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.agentForward).toBe(false);
      expect(result.agent).toBeUndefined();
    });
  });

  describe('when agentForward is false', () => {
    it('sets agentForward to false', () => {
      const config = createServerConfig({ password: 'secret' }, false);
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.agentForward).toBe(false);
    });

    it('does not set agent socket even if SSH_AUTH_SOCK exists', () => {
      process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';
      const config = createServerConfig({ password: 'secret' }, false);
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.agent).toBeUndefined();
    });
  });

  describe('when agentForward is true', () => {
    it('enables agentForward when SSH_AUTH_SOCK is available', () => {
      process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';
      const config = createServerConfig({ password: 'secret' }, true);
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.agentForward).toBe(true);
      expect(result.agent).toBe('/tmp/ssh-agent.sock');
    });

    it('disables agentForward when SSH_AUTH_SOCK is not set', () => {
      delete process.env.SSH_AUTH_SOCK;
      const config = createServerConfig({ password: 'secret' }, true);
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.agentForward).toBe(false);
      expect(result.agent).toBeUndefined();
    });

    it('works with password auth', () => {
      process.env.SSH_AUTH_SOCK = '/run/user/1000/ssh-agent.sock';
      const config = createServerConfig({ password: 'mypassword' }, true);
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.agentForward).toBe(true);
      expect(result.agent).toBe('/run/user/1000/ssh-agent.sock');
      expect(result.password).toBe('mypassword');
    });

    it('works with privateKey auth', () => {
      process.env.SSH_AUTH_SOCK = '/run/user/1000/ssh-agent.sock';
      const config = createServerConfig(
        {
          privateKey:
            '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----',
        },
        true,
      );
      const result = buildSshConnectConfig(config, mockOptions);

      expect(result.agentForward).toBe(true);
      expect(result.agent).toBe('/run/user/1000/ssh-agent.sock');
      expect(result.privateKey).toBe(
        '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----',
      );
    });
  });
});
