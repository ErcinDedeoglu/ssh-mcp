// ConfigLoader tests: file permission validation (0600, 0400, insecure modes).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { loadConfig } from '../../../src/config/loader.js';
import {
  createTestContext,
  setupTestEnv,
  teardownTestEnv,
  writeConfigFile,
  createValidConfig,
  type ConfigTestContext,
} from './_fixtures/config-test.fixtures.js';

describe('ConfigLoader file permissions', () => {
  let ctx: ConfigTestContext;

  beforeEach(() => {
    ctx = createTestContext('perms');
    setupTestEnv(ctx);
  });

  afterEach(() => {
    teardownTestEnv(ctx);
  });

  it('throws on insecure file permissions (0644)', () => {
    const validConfig = createValidConfig();
    writeConfigFile(ctx.configPath, validConfig, 0o644);

    expect(() => loadConfig()).toThrow(/insecure file permissions/i);
  });

  it('throws on insecure file permissions (0755)', () => {
    const validConfig = createValidConfig();
    writeConfigFile(ctx.configPath, validConfig, 0o755);

    expect(() => loadConfig()).toThrow(/insecure file permissions/i);
  });

  it('allows 0600 permissions', () => {
    const validConfig = createValidConfig();
    writeConfigFile(ctx.configPath, validConfig, 0o600);

    const config = loadConfig();
    expect(config.servers).toHaveLength(1);
  });

  it('allows 0400 permissions (stricter than 0600)', () => {
    const validConfig = createValidConfig();
    writeConfigFile(ctx.configPath, validConfig, 0o400);

    const config = loadConfig();
    expect(config.servers).toHaveLength(1);
  });

  it('throws on unreadable config file (EACCES)', () => {
    const validConfig = createValidConfig();
    writeConfigFile(ctx.configPath, validConfig, 0o000);

    try {
      expect(() => loadConfig()).toThrow();
    } finally {
      fs.chmodSync(ctx.configPath, 0o600);
    }
  });
});
