import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig } from '../../src/config/loader.js';
import type { Config, Auth } from '../../src/config/types.js';
import { isPasswordAuth, isPrivateKeyAuth } from '../../src/config/types.js';

describe('ConfigLoader', () => {
  const testDir = path.join(os.tmpdir(), 'ssh-mcp-test-' + process.pid);
  const configDir = path.join(testDir, '.ssh-mcp');
  const configPath = path.join(configDir, 'config.json');
  let originalHome: string | undefined;

  const validConfig: Config = {
    servers: [
      {
        id: 'test-server',
        host: '192.168.1.100',
        port: 22,
        username: 'ubuntu',
        auth: { privateKey: '/home/user/.ssh/id_rsa' },
      },
    ],
  };

  beforeEach(() => {
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('loads valid config file', () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));
    fs.chmodSync(configPath, 0o600);

    const config = loadConfig();

    expect(config).toEqual(validConfig);
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].id).toBe('test-server');
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig()).toThrow('Config file not found at ~/.ssh-mcp/config.json');
  });

  it('throws on invalid JSON', () => {
    fs.writeFileSync(configPath, '{ invalid json }');
    fs.chmodSync(configPath, 0o600);

    expect(() => loadConfig()).toThrow('Invalid JSON in config file');
  });

  it('throws on schema validation failure - missing required field', () => {
    const invalidConfig = { servers: [{ id: 'test' }] };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));
    fs.chmodSync(configPath, 0o600);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });

  it('throws on schema validation failure - empty servers array', () => {
    const invalidConfig = { servers: [] };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));
    fs.chmodSync(configPath, 0o600);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
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
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));
    fs.chmodSync(configPath, 0o600);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });

  it('throws on insecure file permissions (0644)', () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));
    fs.chmodSync(configPath, 0o644);

    expect(() => loadConfig()).toThrow(/insecure file permissions/i);
  });

  it('throws on insecure file permissions (0755)', () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));
    fs.chmodSync(configPath, 0o755);

    expect(() => loadConfig()).toThrow(/insecure file permissions/i);
  });

  it('allows 0600 permissions', () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));
    fs.chmodSync(configPath, 0o600);

    const config = loadConfig();
    expect(config.servers).toHaveLength(1);
  });

  it('allows 0400 permissions (stricter than 0600)', () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));
    fs.chmodSync(configPath, 0o400);

    const config = loadConfig();
    expect(config.servers).toHaveLength(1);
  });

  it('expands ~ in config path', () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));
    fs.chmodSync(configPath, 0o600);

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
    fs.writeFileSync(configPath, JSON.stringify(passwordConfig));
    fs.chmodSync(configPath, 0o600);

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
    fs.writeFileSync(configPath, JSON.stringify(keyConfig));
    fs.chmodSync(configPath, 0o600);

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
    fs.writeFileSync(configPath, JSON.stringify(configWithDefaults));
    fs.chmodSync(configPath, 0o600);

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
    fs.writeFileSync(configPath, JSON.stringify(multiServerConfig));
    fs.chmodSync(configPath, 0o600);

    const config = loadConfig();

    expect(config.servers).toHaveLength(2);
    expect(config.servers[0].id).toBe('prod-web-01');
    expect(config.servers[1].id).toBe('dev-db');
  });
});

describe('ConfigLoader Edge Cases', () => {
  const testDir = path.join(os.tmpdir(), 'ssh-mcp-edge-test-' + process.pid);
  const configDir = path.join(testDir, '.ssh-mcp');
  const configPath = path.join(configDir, 'config.json');
  let originalHome: string | undefined;

  const validConfig: Config = {
    servers: [
      {
        id: 'test-server',
        host: '192.168.1.100',
        port: 22,
        username: 'ubuntu',
        auth: { privateKey: '/home/user/.ssh/id_rsa' },
      },
    ],
  };

  beforeEach(() => {
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('throws on unreadable config file (EACCES)', () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));
    fs.chmodSync(configPath, 0o000);

    try {
      expect(() => loadConfig()).toThrow();
    } finally {
      fs.chmodSync(configPath, 0o600);
    }
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
    fs.writeFileSync(configPath, JSON.stringify(invalidAuthConfig));
    fs.chmodSync(configPath, 0o600);

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
    fs.writeFileSync(configPath, JSON.stringify(invalidPortConfig));
    fs.chmodSync(configPath, 0o600);

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
    fs.writeFileSync(configPath, JSON.stringify(invalidTimeoutConfig));
    fs.chmodSync(configPath, 0o600);

    expect(() => loadConfig()).toThrow(/schema validation failed/i);
  });
});

describe('Type Guards', () => {
  describe('isPasswordAuth', () => {
    it('returns true for password auth object', () => {
      const auth: Auth = { password: 'secret123' };
      expect(isPasswordAuth(auth)).toBe(true);
    });

    it('returns false for private key auth object', () => {
      const auth: Auth = { privateKey: '/path/to/key' };
      expect(isPasswordAuth(auth)).toBe(false);
    });

    it('returns false for private key auth with passphrase', () => {
      const auth: Auth = { privateKey: '/path/to/key', passphrase: 'keypass' };
      expect(isPasswordAuth(auth)).toBe(false);
    });
  });

  describe('isPrivateKeyAuth', () => {
    it('returns true for private key auth object', () => {
      const auth: Auth = { privateKey: '/path/to/key' };
      expect(isPrivateKeyAuth(auth)).toBe(true);
    });

    it('returns true for private key auth with passphrase', () => {
      const auth: Auth = { privateKey: '/path/to/key', passphrase: 'keypass' };
      expect(isPrivateKeyAuth(auth)).toBe(true);
    });

    it('returns false for password auth object', () => {
      const auth: Auth = { password: 'secret123' };
      expect(isPrivateKeyAuth(auth)).toBe(false);
    });
  });
});
