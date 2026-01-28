import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config, ServerConfig, PasswordAuth } from '../../src/config/types.js';
import { ConnectionPool } from '../../src/ssh/pool.js';
import { sanitizeError, sanitizePath } from '../../src/tools/utils.js';

const mockInstances: EventEmitter[] = [];

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as typeof import('node:events');
  
  class MockClient extends EventEmitter {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    sftp = vi.fn();
    
    constructor() {
      super();
      mockInstances.push(this);
    }
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

function clearMockInstances(): void {
  mockInstances.length = 0;
}

function getMockClient(index = 0): EventEmitter & { 
  connect: ReturnType<typeof vi.fn>; 
  end: ReturnType<typeof vi.fn>; 
  destroy: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
  sftp: ReturnType<typeof vi.fn>;
} {
  return mockInstances[index] as EventEmitter & { 
    connect: ReturnType<typeof vi.fn>; 
    end: ReturnType<typeof vi.fn>; 
    destroy: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
    sftp: ReturnType<typeof vi.fn>;
  };
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}
type ToolHandler = (...args: unknown[]) => Promise<ToolResult>;
type ErrorCallback = (err: Error | null, result?: unknown) => void;
type ExecCallback = (err: Error | null, stream?: EventEmitter & { stderr: EventEmitter }) => void;

interface MockServer {
  tool: ReturnType<typeof vi.fn>;
  getToolHandler: (name: string) => ToolHandler | undefined;
  getToolConfig: (name: string) => object | undefined;
}

function createMockServer(): MockServer {
  const registeredTools = new Map<string, { config: object; handler: ToolHandler }>();
  
  return {
    tool: vi.fn((...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as ToolHandler;
      let config: object;
      if (args.length === 3) {
        config = typeof args[1] === 'string' 
          ? { description: args[1] } 
          : args[1] as object;
      } else if (args.length === 4) {
        config = { description: args[1], schema: args[2] };
      } else {
        config = {};
      }
      registeredTools.set(name, { config, handler });
    }),
    getToolHandler: (name: string) => registeredTools.get(name)?.handler,
    getToolConfig: (name: string) => registeredTools.get(name)?.config,
  };
}

describe('MCP Tools', () => {
  let config: Config;
  let pool: ConnectionPool;
  let serverConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockInstances();

    serverConfig = {
      id: 'test-server',
      host: '192.168.1.100',
      port: 22,
      username: 'ubuntu',
      auth: { password: 'secret123' } as PasswordAuth,
      description: 'Test server',
      timeouts: {
        command: 30,
      },
    };

    config = {
      servers: [serverConfig],
      defaults: {
        timeouts: {
          command: 60,
          idle: 900,
        },
      },
    };

    pool = new ConnectionPool();
  });

  describe('sanitizeError', () => {
    it('replaces home directory with ~', () => {
      const homeDir = homedir();
      const error = new Error(`File not found: ${homeDir}/secret/file.txt`);
      const sanitized = sanitizeError(error);
      expect(sanitized).toBe('File not found: ~/secret/file.txt');
      expect(sanitized).not.toContain(homeDir);
    });

    it('redacts password values', () => {
      const error = new Error('Connection failed: password=supersecret123');
      const sanitized = sanitizeError(error);
      expect(sanitized).toBe('Connection failed: password=***');
      expect(sanitized).not.toContain('supersecret123');
    });

    it('redacts privateKey paths', () => {
      const error = new Error('Auth failed: privateKey=/home/user/.ssh/id_rsa');
      const sanitized = sanitizeError(error);
      expect(sanitized).toBe('Auth failed: privateKey=***');
      expect(sanitized).not.toContain('/home/user/.ssh/id_rsa');
    });

    it('redacts passphrase values', () => {
      const error = new Error('Decryption failed: passphrase=mypassphrase');
      const sanitized = sanitizeError(error);
      expect(sanitized).toBe('Decryption failed: passphrase=***');
      expect(sanitized).not.toContain('mypassphrase');
    });

    it('redacts private key content', () => {
      const error = new Error('Key error: -----BEGIN RSA PRIVATE KEY-----\nMIIE...content...\n-----END RSA PRIVATE KEY-----');
      const sanitized = sanitizeError(error);
      expect(sanitized).toBe('Key error: [REDACTED_KEY]');
      expect(sanitized).not.toContain('BEGIN');
      expect(sanitized).not.toContain('PRIVATE KEY');
    });

    it('handles non-Error objects', () => {
      const sanitized = sanitizeError('Simple string error');
      expect(sanitized).toBe('Simple string error');
    });
  });

  describe('sanitizePath', () => {
    it('replaces home directory with ~', () => {
      const homeDir = homedir();
      const path = `${homeDir}/documents/file.txt`;
      const sanitized = sanitizePath(path);
      expect(sanitized).toBe('~/documents/file.txt');
    });

    it('leaves non-home paths unchanged', () => {
      const path = '/var/log/app.log';
      const sanitized = sanitizePath(path);
      expect(sanitized).toBe('/var/log/app.log');
    });
  });

  describe('list_servers', () => {
    it('returns all configured servers', async () => {
      const { registerListServersTool } = await import('../../src/tools/list-servers.js');
      
      const mockServer = createMockServer();
      registerListServersTool(mockServer as unknown as McpServer, config, pool);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'list_servers',
        expect.any(String),
        expect.any(Function)
      );

      const handler = mockServer.getToolHandler('list_servers')!;
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('test-server');
      expect(parsed[0].host).toBe('192.168.1.100');
      expect(parsed[0].port).toBe(22);
      expect(parsed[0].username).toBe('ubuntu');
      expect(parsed[0].description).toBe('Test server');
    });

    it('includes connection status for each server', async () => {
      const { registerListServersTool } = await import('../../src/tools/list-servers.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      
      pool.add(session);

      const mockServer = createMockServer();
      registerListServersTool(mockServer as unknown as McpServer, config, pool);

      const handler = mockServer.getToolHandler('list_servers')!;
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed[0].connected).toBe(true);
    });
  });

  describe('connect', () => {
    it('connects to a server and adds to pool', async () => {
      const { registerConnectTool } = await import('../../src/tools/connect.js');
      
      const mockServer = createMockServer();
      registerConnectTool(mockServer as unknown as McpServer, config, pool);

      const handler = mockServer.getToolHandler('connect')!;
      
      const resultPromise = handler({ serverId: 'test-server' });
      await new Promise(resolve => setImmediate(resolve));
      getMockClient().emit('ready');
      
      const result = await resultPromise;

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('connected');
      expect(parsed.serverId).toBe('test-server');
      expect(pool.has('test-server')).toBe(true);
    });

    it('returns already_connected if connection exists', async () => {
      const { registerConnectTool } = await import('../../src/tools/connect.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      const mockServer = createMockServer();
      registerConnectTool(mockServer as unknown as McpServer, config, pool);

      const handler = mockServer.getToolHandler('connect')!;
      const result = await handler({ serverId: 'test-server' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('already_connected');
    });

    it('returns error for unknown server', async () => {
      const { registerConnectTool } = await import('../../src/tools/connect.js');
      
      const mockServer = createMockServer();
      registerConnectTool(mockServer as unknown as McpServer, config, pool);

      const handler = mockServer.getToolHandler('connect')!;
      const result = await handler({ serverId: 'unknown-server' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('disconnect', () => {
    it('disconnects and removes from pool', async () => {
      const { registerDisconnectTool } = await import('../../src/tools/disconnect.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      const mockServer = createMockServer();
      registerDisconnectTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('disconnect')!;
      const result = await handler({ serverId: 'test-server' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('disconnected');
      expect(pool.has('test-server')).toBe(false);
    });

    it('returns error for non-existent connection', async () => {
      const { registerDisconnectTool } = await import('../../src/tools/disconnect.js');
      
      const mockServer = createMockServer();
      registerDisconnectTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('disconnect')!;
      const result = await handler({ serverId: 'unknown-server' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No active connection');
    });
  });

  describe('execute', () => {
    it('runs command and returns stdout/stderr/exitCode', async () => {
      const { registerExecuteTool } = await import('../../src/tools/execute.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      mockClient.exec.mockImplementation((_cmd: string, callback: ExecCallback) => {
        const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
        stream.stderr = new EventEmitter();
        
        setImmediate(() => {
          stream.emit('data', Buffer.from('Hello World\n'));
          stream.stderr.emit('data', Buffer.from(''));
          stream.emit('close', 0);
        });
        
        callback(null, stream);
      });

      const mockServer = createMockServer();
      registerExecuteTool(mockServer as unknown as McpServer, config, pool);

      const handler = mockServer.getToolHandler('execute')!;
      const result = await handler({ serverId: 'test-server', command: 'echo "Hello World"' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stdout).toBe('Hello World\n');
      expect(parsed.stderr).toBe('');
      expect(parsed.exitCode).toBe(0);
    });

    it('respects timeout configuration', async () => {
      const { registerExecuteTool } = await import('../../src/tools/execute.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      mockClient.exec.mockImplementation((_cmd: string, callback: ExecCallback) => {
        const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
        stream.stderr = new EventEmitter();
        callback(null, stream);
      });

      const mockServer = createMockServer();
      registerExecuteTool(mockServer as unknown as McpServer, config, pool);

      const handler = mockServer.getToolHandler('execute')!;
      const resultPromise = handler({ serverId: 'test-server', command: 'sleep 100', timeout: 0.05 });

      const result = await resultPromise;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('timed out');
    });

    it('sanitizes error messages', async () => {
      const { registerExecuteTool } = await import('../../src/tools/execute.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      const homeDir = homedir();
      mockClient.exec.mockImplementation((_cmd: string, callback: ExecCallback) => {
        callback(new Error(`Failed at ${homeDir}/secret/script.sh with password=secret123`));
      });

      const mockServer = createMockServer();
      registerExecuteTool(mockServer as unknown as McpServer, config, pool);

      const handler = mockServer.getToolHandler('execute')!;
      const result = await handler({ serverId: 'test-server', command: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).not.toContain(homeDir);
      expect(result.content[0].text).not.toContain('secret123');
      expect(result.content[0].text).toContain('~/secret/script.sh');
      expect(result.content[0].text).toContain('password=***');
    });

    it('returns error when not connected', async () => {
      const { registerExecuteTool } = await import('../../src/tools/execute.js');
      
      const mockServer = createMockServer();
      registerExecuteTool(mockServer as unknown as McpServer, config, pool);

      const handler = mockServer.getToolHandler('execute')!;
      const result = await handler({ serverId: 'test-server', command: 'ls' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No active connection');
    });
  });

  describe('upload', () => {
    it('uploads file via SFTP', async () => {
      const { registerUploadTool } = await import('../../src/tools/upload.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      const mockSftp = {
        fastPut: vi.fn((_local: string, _remote: string, callback: ErrorCallback) => {
          callback(null);
        }),
      };
      mockClient.sftp.mockImplementation((callback: ErrorCallback) => {
        callback(null, mockSftp);
      });

      const mockServer = createMockServer();
      registerUploadTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('upload')!;
      const result = await handler({ 
        serverId: 'test-server', 
        localPath: '/tmp/test.txt', 
        remotePath: '~/uploads/test.txt' 
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('uploaded');
    });

    it('validates file size', async () => {
      const fs = await import('node:fs');
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ 
        mode: 0o100600, 
        size: 200 * 1024 * 1024 
      });

      const { registerUploadTool } = await import('../../src/tools/upload.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      const mockServer = createMockServer();
      registerUploadTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('upload')!;
      const result = await handler({ 
        serverId: 'test-server', 
        localPath: '/tmp/large.bin', 
        remotePath: '~/uploads/large.bin' 
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('too large');
    });
  });

  describe('download', () => {
    it('downloads file via SFTP', async () => {
      const { registerDownloadTool } = await import('../../src/tools/download.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      const mockSftp = {
        stat: vi.fn((_path: string, callback: ErrorCallback) => {
          callback(null, { size: 1024 });
        }),
        fastGet: vi.fn((_remote: string, _local: string, callback: ErrorCallback) => {
          callback(null);
        }),
      };
      mockClient.sftp.mockImplementation((callback: ErrorCallback) => {
        callback(null, mockSftp);
      });

      const mockServer = createMockServer();
      registerDownloadTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('download')!;
      const result = await handler({ 
        serverId: 'test-server', 
        remotePath: '~/data/file.txt', 
        localPath: '/tmp/downloaded.txt' 
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('downloaded');
    });

    it('validates remote file size', async () => {
      const { registerDownloadTool } = await import('../../src/tools/download.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      const mockSftp = {
        stat: vi.fn((_path: string, callback: ErrorCallback) => {
          callback(null, { size: 200 * 1024 * 1024 });
        }),
      };
      mockClient.sftp.mockImplementation((callback: ErrorCallback) => {
        callback(null, mockSftp);
      });

      const mockServer = createMockServer();
      registerDownloadTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('download')!;
      const result = await handler({ 
        serverId: 'test-server', 
        remotePath: '~/data/large.bin', 
        localPath: '/tmp/large.bin' 
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('too large');
    });
  });

  describe('connection_status', () => {
    it('returns health status for connected server', async () => {
      const { registerConnectionStatusTool } = await import('../../src/tools/connection-status.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig);
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      const mockServer = createMockServer();
      registerConnectionStatusTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('connection_status')!;
      const result = await handler({ serverId: 'test-server' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.connected).toBe(true);
      expect(parsed.idle).toBe(false);
      expect(parsed.reconnecting).toBe(false);
      expect(parsed.lastActivityMs).toBeGreaterThan(0);
    });

    it('returns not connected for unknown server', async () => {
      const { registerConnectionStatusTool } = await import('../../src/tools/connection-status.js');
      
      const mockServer = createMockServer();
      registerConnectionStatusTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('connection_status')!;
      const result = await handler({ serverId: 'unknown-server' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.connected).toBe(false);
      expect(parsed.message).toBe('No active connection');
    });

    it('includes reconnect attempt when reconnecting', async () => {
      const { registerConnectionStatusTool } = await import('../../src/tools/connection-status.js');
      const { SessionKeeper } = await import('../../src/ssh/session.js');
      
      const session = new SessionKeeper(serverConfig, {
        baseReconnectDelayMs: 1000,
      });
      const mockClient = getMockClient();
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      pool.add(session);

      mockClient.emit('close');
      await new Promise(resolve => setTimeout(resolve, 10));

      const mockServer = createMockServer();
      registerConnectionStatusTool(mockServer as unknown as McpServer, pool);

      const handler = mockServer.getToolHandler('connection_status')!;
      const result = await handler({ serverId: 'test-server' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.reconnecting).toBe(true);
      expect(parsed.reconnectAttempt).toBe(1);
    });
  });
});
