// ConfigLoader tests: basic loading, path expansion, and auth type configurations.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Config } from '../../../src/config/types.js';
import { loadConfig } from '../../../src/config/loader.js';
import {
  createTestContext,
  setupTestEnv,
  teardownTestEnv,
  writeConfigFile,
  createValidConfig,
  type ConfigTestContext,
} from './_fixtures/config-test.fixtures.js';

describe('ConfigLoader basic loading', () => {
  let ctx: ConfigTestContext;

  beforeEach(() => {
    ctx = createTestContext('basic');
    setupTestEnv(ctx);
  });

  afterEach(() => {
    teardownTestEnv(ctx);
  });

  it('loads valid config file', () => {
    const validConfig = createValidConfig();
    writeConfigFile(ctx.configPath, validConfig);

    const config = loadConfig();

    expect(config).toEqual(validConfig);
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].id).toBe('test-server');
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig()).toThrow('Config file not found');
  });

  it('expands ~ in config path', () => {
    const validConfig = createValidConfig();
    writeConfigFile(ctx.configPath, validConfig);

    const config = loadConfig();

    expect(config).toBeDefined();
    expect(config.servers[0].host).toBe('192.168.1.100');
  });

  it('loads config with password authentication', () => {
    const passwordConfig: Config = {
      servers: [
        {
          id: 'password-server',
          host: 'server.example.com',
          port: 2222,
          username: 'admin',
          auth: { password: 'secret123' },
        },
      ],
    };
    writeConfigFile(ctx.configPath, passwordConfig);

    const config = loadConfig();

    expect(config.servers[0].auth).toEqual({ password: 'secret123' });
  });

  it('loads config with private key and passphrase', () => {
    const keyConfig: Config = {
      servers: [
        {
          id: 'key-server',
          host: 'secure.example.com',
          port: 22,
          username: 'deploy',
          auth: {
            privateKey: '/home/deploy/.ssh/id_ed25519',
            passphrase: 'keypass',
          },
        },
      ],
    };
    writeConfigFile(ctx.configPath, keyConfig);

    const config = loadConfig();

    expect(config.servers[0].auth).toEqual({
      privateKey: '/home/deploy/.ssh/id_ed25519',
      passphrase: 'keypass',
    });
  });

  it('loads config with defaults and server-specific overrides', () => {
    const configWithDefaults: Config = {
      servers: [
        {
          id: 'server-1',
          host: 'host1.example.com',
          port: 22,
          username: 'user1',
          auth: { password: 'pass1' },
          timeouts: { command: 120 },
        },
      ],
      defaults: {
        timeouts: { connection: 30, command: 60, idle: 1800 },
        connectionPool: { maxConnections: 5, reuseConnections: true },
      },
    };
    writeConfigFile(ctx.configPath, configWithDefaults);

    const config = loadConfig();

    expect(config.defaults?.timeouts?.connection).toBe(30);
    expect(config.servers[0].timeouts?.command).toBe(120);
  });

  it('loads config with multiple servers', () => {
    const multiServerConfig: Config = {
      servers: [
        {
          id: 'prod-web-01',
          host: '10.0.1.10',
          port: 22,
          username: 'ubuntu',
          auth: { privateKey: '/keys/prod.pem' },
          description: 'Production web server',
        },
        {
          id: 'dev-db',
          host: '10.0.2.20',
          port: 22,
          username: 'postgres',
          auth: { password: 'devpass' },
          description: 'Development database',
        },
      ],
    };
    writeConfigFile(ctx.configPath, multiServerConfig);

    const config = loadConfig();

    expect(config.servers).toHaveLength(2);
    expect(config.servers[0].id).toBe('prod-web-01');
    expect(config.servers[1].id).toBe('dev-db');
  });
});
