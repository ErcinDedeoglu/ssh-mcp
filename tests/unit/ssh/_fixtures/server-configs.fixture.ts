/**
 * Test server configuration factories for SSH connection tests.
 * Provides consistent test data across all SSH-related test files.
 */
import type { ServerConfig, PasswordAuth, PrivateKeyAuth } from '../../../../src/config/types.js';

export function createPasswordServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    id: 'test-server-password',
    host: '192.168.1.100',
    port: 22,
    username: 'ubuntu',
    auth: { password: 'secret123' } as PasswordAuth,
    ...overrides,
  };
}

export function createKeyServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    id: 'test-server-key',
    host: '192.168.1.200',
    port: 2222,
    username: 'deploy',
    auth: { privateKey: '/home/user/.ssh/id_rsa', passphrase: 'keypass' } as PrivateKeyAuth,
    ...overrides,
  };
}

export function createPoolServerConfig(id: string, host: string): ServerConfig {
  return {
    id,
    host,
    port: 22,
    username: `user-${id}`,
    auth: { password: `pass-${id}` } as PasswordAuth,
  };
}
