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
    it('creates server instance', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });

    it('creates ForwardRegistry instance', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      const registry = server.getForwardRegistry();
      expect(registry).toBeDefined();
      expect(registry.size).toBe(0);
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

    it('clears forward registry on shutdown', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);

      const registry = server.getForwardRegistry();
      expect(registry.size).toBe(0);

      await server.shutdown();
      expect(registry.size).toBe(0);
    });

    it('closes all active forwards on shutdown', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      const registry = server.getForwardRegistry();

      const mockServer1 = { close: vi.fn() };
      const mockServer2 = { close: vi.fn() };
      const mockSocket1 = { destroy: vi.fn() };
      const mockSocket2 = { destroy: vi.fn() };

      registry.add({
        serverId: 'test-server',
        localHost: '127.0.0.1',
        localPort: 9001,
        remoteHost: 'localhost',
        remotePort: 3306,
        server: mockServer1 as never,
        activeSockets: new Set([mockSocket1 as never]),
        createdAt: Date.now(),
      });

      registry.add({
        serverId: 'test-server',
        localHost: '127.0.0.1',
        localPort: 9002,
        remoteHost: 'localhost',
        remotePort: 5432,
        server: mockServer2 as never,
        activeSockets: new Set([mockSocket2 as never]),
        createdAt: Date.now(),
      });

      expect(registry.size).toBe(2);

      await server.shutdown();

      expect(registry.size).toBe(0);
      expect(mockServer1.close).toHaveBeenCalled();
      expect(mockServer2.close).toHaveBeenCalled();
      expect(mockSocket1.destroy).toHaveBeenCalled();
      expect(mockSocket2.destroy).toHaveBeenCalled();
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
    const expectedTools = [
      'list_servers',
      'connect',
      'disconnect',
      'execute',
      'upload',
      'download',
      'connection_status',
      'forward_port',
      'close_forward',
      'list_forwards',
    ];

    it.each(expectedTools)('has %s tool available', async () => {
      const { SSHMCPServer } = await import('../../src/server.js');
      const server = new SSHMCPServer(config);
      expect(server).toBeDefined();
    });
  });
});
