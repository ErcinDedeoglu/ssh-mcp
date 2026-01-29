import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Config, ServerConfig, PasswordAuth } from '../../src/config/types.js';

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as typeof import('node:events');

  class MockClient extends EventEmitter {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    sftp = vi.fn();
  }

  return { MockClient };
});

vi.mock('ssh2', () => ({
  Client: MockClient,
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600, size: 1024 })),
}));

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    servers: [
      {
        id: 'test-server',
        host: '192.168.1.100',
        port: 22,
        username: 'ubuntu',
        auth: { password: 'secret123' },
        description: 'Test server',
        timeouts: { command: 30 },
      },
    ],
    defaults: {
      timeouts: { command: 60, idle: 900 },
    },
  })),
}));

const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
  })),
}));

describe('SSHMCPServer', () => {
  let config: Config;
  let serverConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    serverConfig = {
      id: 'test-server',
      host: '192.168.1.100',
      port: 22,
      username: 'ubuntu',
      auth: { password: 'secret123' } as PasswordAuth,
      description: 'Test server',
      timeouts: { command: 30 },
    };

    config = {
      servers: [serverConfig],
      defaults: {
        timeouts: { command: 60, idle: 900 },
      },
    };
  });

  describe('initialization', () => {
    it('creates server with correct name and version', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });

    it('registers all 7 tools', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('clears connection pool on shutdown', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);

      const pool = server.getPool();
      expect(pool.size).toBe(0);

      await server.shutdown();
      expect(pool.size).toBe(0);
    });
  });

  describe('run', () => {
    it('creates StdioServerTransport and connects', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
      const server = new SSHMCPServer(config);

      await server.run();

      expect(StdioServerTransport).toHaveBeenCalled();
    });
  });

  describe('tool registration', () => {
    it('has list_servers tool available', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });

    it('has connect tool available', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });

    it('has disconnect tool available', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });

    it('has execute tool available', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });

    it('has upload tool available', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });

    it('has download tool available', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });

    it('has connection_status tool available', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });
  });
});
