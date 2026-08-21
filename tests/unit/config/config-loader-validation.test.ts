// ConfigLoader tests: JSON parsing and schema validation errors.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { loadConfig } from '../../../src/config/loader.js';
import {
  createTestContext,
  setupTestEnv,
  teardownTestEnv,
  writeConfigFile,
  type ConfigTestContext,
} from './_fixtures/config-test.fixtures.js';

describe('ConfigLoader validation errors', () => {
  let ctx: ConfigTestContext;

  beforeEach(() => {
    ctx = createTestContext('validation');
    setupTestEnv(ctx);
  });

  afterEach(() => {
    teardownTestEnv(ctx);
  });

  it('throws on invalid JSON', () => {
    fs.writeFileSync(ctx.configPath, '{ invalid json }');
    fs.chmodSync(ctx.configPath, 0o600);

    expect(() => loadConfig()).toThrow('Invalid JSON in config file');
  });

  it('throws on schema validation failure - missing required field', () => {
    const invalidConfig = { servers: [{ id: 'test' }] };
    writeConfigFile(ctx.configPath, invalidConfig);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });

  it('accepts an empty servers array (valid since zero-server configs)', () => {
    const validConfig = { servers: [] };
    writeConfigFile(ctx.configPath, validConfig);

    const config = loadConfig();
    expect(config.servers).toEqual([]);
  });

  it('throws on schema validation failure - invalid server id pattern', () => {
    const invalidConfig = {
      servers: [
        {
          id: 'invalid id with spaces',
          host: 'localhost',
          port: 22,
          username: 'user',
          auth: { password: 'secret' },
        },
      ],
    };
    writeConfigFile(ctx.configPath, invalidConfig);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });

  it('throws on invalid auth configuration (neither password nor privateKey)', () => {
    const invalidAuthConfig = {
      servers: [
        {
          id: 'test-server',
          host: '192.168.1.100',
          port: 22,
          username: 'ubuntu',
          auth: {},
        },
      ],
    };
    writeConfigFile(ctx.configPath, invalidAuthConfig);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });

  it('throws on invalid port number (out of range)', () => {
    const invalidPortConfig = {
      servers: [
        {
          id: 'test-server',
          host: '192.168.1.100',
          port: 70000,
          username: 'ubuntu',
          auth: { password: 'secret' },
        },
      ],
    };
    writeConfigFile(ctx.configPath, invalidPortConfig);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });

  it('throws on invalid timeout values (negative)', () => {
    const invalidTimeoutConfig = {
      servers: [
        {
          id: 'test-server',
          host: '192.168.1.100',
          port: 22,
          username: 'ubuntu',
          auth: { password: 'secret' },
          timeouts: { connection: -5 },
        },
      ],
    };
    writeConfigFile(ctx.configPath, invalidTimeoutConfig);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });
});
