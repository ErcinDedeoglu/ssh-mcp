import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Config } from '../../../src/config/types.js';
import { loadConfig } from '../../../src/config/loader.js';
import {
  createTestContext,
  setupTestEnv,
  teardownTestEnv,
  writeConfigFile,
  type ConfigTestContext,
} from './_fixtures/config-test.fixtures.js';

describe('ConfigLoader agentForward option', () => {
  let ctx: ConfigTestContext;

  beforeEach(() => {
    ctx = createTestContext('agent-forward');
    setupTestEnv(ctx);
  });

  afterEach(() => {
    teardownTestEnv(ctx);
  });

  it('loads config with agentForward set to true', () => {
    const config: Config = {
      servers: [
        {
          id: 'agent-forward-server',
          host: 'dev.example.com',
          port: 22,
          username: 'developer',
          auth: { privateKey: '~/.ssh/id_rsa' },
          agentForward: true,
        },
      ],
    };
    writeConfigFile(ctx.configPath, config);

    const loaded = loadConfig();

    expect(loaded.servers[0].agentForward).toBe(true);
  });

  it('loads config with agentForward set to false', () => {
    const config: Config = {
      servers: [
        {
          id: 'no-agent-forward',
          host: 'prod.example.com',
          port: 22,
          username: 'admin',
          auth: { password: 'secret' },
          agentForward: false,
        },
      ],
    };
    writeConfigFile(ctx.configPath, config);

    const loaded = loadConfig();

    expect(loaded.servers[0].agentForward).toBe(false);
  });

  it('loads config without agentForward (defaults to undefined)', () => {
    const config: Config = {
      servers: [
        {
          id: 'default-server',
          host: 'server.example.com',
          port: 22,
          username: 'user',
          auth: { password: 'pass' },
        },
      ],
    };
    writeConfigFile(ctx.configPath, config);

    const loaded = loadConfig();

    expect(loaded.servers[0].agentForward).toBeUndefined();
  });

  it('rejects invalid agentForward type (string instead of boolean)', () => {
    const invalidConfig = {
      servers: [
        {
          id: 'invalid-agent-forward',
          host: 'server.example.com',
          port: 22,
          username: 'user',
          auth: { password: 'pass' },
          agentForward: 'yes',
        },
      ],
    };
    writeConfigFile(ctx.configPath, invalidConfig);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });

  it('rejects invalid agentForward type (number instead of boolean)', () => {
    const invalidConfig = {
      servers: [
        {
          id: 'invalid-agent-forward',
          host: 'server.example.com',
          port: 22,
          username: 'user',
          auth: { password: 'pass' },
          agentForward: 1,
        },
      ],
    };
    writeConfigFile(ctx.configPath, invalidConfig);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });

  it('works with agentForward alongside other server options', () => {
    const config: Config = {
      servers: [
        {
          id: 'full-config-server',
          host: 'dev.example.com',
          port: 2222,
          username: 'developer',
          auth: { privateKey: '~/.ssh/id_ed25519', passphrase: 'keypass' },
          agentForward: true,
          description: 'Dev server with agent forwarding',
          timeouts: { connection: 30, command: 120 },
        },
      ],
    };
    writeConfigFile(ctx.configPath, config);

    const loaded = loadConfig();

    expect(loaded.servers[0].agentForward).toBe(true);
    expect(loaded.servers[0].description).toBe('Dev server with agent forwarding');
    expect(loaded.servers[0].timeouts?.connection).toBe(30);
  });
});
