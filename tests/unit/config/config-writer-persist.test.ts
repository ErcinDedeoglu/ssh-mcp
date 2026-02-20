// Tests for persistShellType: writing detected shell types back to config file.
import * as fs from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { persistShellType } from '../../../src/config/writer.js';
import {
  createTestContext,
  setupTestEnv,
  teardownTestEnv,
  writeConfigFile,
  createValidConfig,
  type ConfigTestContext,
} from './_fixtures/config-test.fixtures.js';

describe('persistShellType', () => {
  let ctx: ConfigTestContext;

  beforeEach(() => {
    ctx = createTestContext('writer');
    setupTestEnv(ctx);
  });

  afterEach(() => {
    teardownTestEnv(ctx);
  });

  function readRawConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(ctx.configPath, 'utf-8'));
  }

  it('persists detected shell type for a server with no shell field', () => {
    const config = createValidConfig();
    writeConfigFile(ctx.configPath, config);

    persistShellType('test-server', 'powershell');

    const raw = readRawConfig();
    const servers = raw.servers as Array<Record<string, unknown>>;
    expect(servers[0].shell).toBe('powershell');
  });

  it('persists detected shell type when shell is explicitly "auto"', () => {
    const config = createValidConfig();
    config.servers[0].shell = 'auto';
    writeConfigFile(ctx.configPath, config);

    persistShellType('test-server', 'cmd');

    const raw = readRawConfig();
    const servers = raw.servers as Array<Record<string, unknown>>;
    expect(servers[0].shell).toBe('cmd');
  });

  it('does not overwrite an explicitly set concrete shell type', () => {
    const config = createValidConfig();
    config.servers[0].shell = 'posix';
    writeConfigFile(ctx.configPath, config);

    persistShellType('test-server', 'powershell');

    const raw = readRawConfig();
    const servers = raw.servers as Array<Record<string, unknown>>;
    expect(servers[0].shell).toBe('posix');
  });

  it('does nothing for unknown server id', () => {
    const config = createValidConfig();
    writeConfigFile(ctx.configPath, config);
    const before = fs.readFileSync(ctx.configPath, 'utf-8');

    persistShellType('nonexistent-server', 'powershell');

    const after = fs.readFileSync(ctx.configPath, 'utf-8');
    expect(after).toBe(before);
  });

  it('preserves other config fields when writing', () => {
    const config = {
      ...createValidConfig(),
      keys: { 'my-key': 'ssh-rsa AAAA...' },
      defaults: { timeouts: { connection: 15 } },
    };
    writeConfigFile(ctx.configPath, config);

    persistShellType('test-server', 'posix');

    const raw = readRawConfig();
    expect(raw.keys).toEqual({ 'my-key': 'ssh-rsa AAAA...' });
    expect(raw.defaults).toEqual({ timeouts: { connection: 15 } });
  });

  it('preserves 0600 permissions after writing', () => {
    writeConfigFile(ctx.configPath, createValidConfig());

    persistShellType('test-server', 'posix');

    const stats = fs.statSync(ctx.configPath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('handles multiple servers and only updates the matching one', () => {
    const config = {
      servers: [
        { id: 'server-a', host: 'a.example.com', port: 22, username: 'u', auth: { password: 'p' } },
        { id: 'server-b', host: 'b.example.com', port: 22, username: 'u', auth: { password: 'p' } },
      ],
    };
    writeConfigFile(ctx.configPath, config);

    persistShellType('server-b', 'powershell');

    const raw = readRawConfig();
    const servers = raw.servers as Array<Record<string, unknown>>;
    expect(servers[0].shell).toBeUndefined();
    expect(servers[1].shell).toBe('powershell');
  });

  it('silently ignores errors when config file does not exist', () => {
    // Config dir exists but no config file was written — no need to unlink
    expect(() => persistShellType('test-server', 'posix')).not.toThrow();
  });

  it('silently ignores errors when config file has invalid JSON', () => {
    fs.writeFileSync(ctx.configPath, 'not-json', { mode: 0o600 });

    expect(() => persistShellType('test-server', 'posix')).not.toThrow();
  });

  it('writes valid JSON that ends with a newline', () => {
    writeConfigFile(ctx.configPath, createValidConfig());

    persistShellType('test-server', 'cmd');

    const content = fs.readFileSync(ctx.configPath, 'utf-8');
    expect(content.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(content)).not.toThrow();
  });
});
