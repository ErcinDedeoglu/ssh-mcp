import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClientChannel } from 'ssh2';
import { createMockServer } from './_fixtures/mock-server.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';
import { ConnectionPool } from '../../../src/ssh/pool.js';
import type { Config, ServerConfig } from '../../../src/config/types.js';

const mockInstances: EventEmitter[] = [];

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');

  class MockClient extends EE {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    sftp = vi.fn();
    forwardOut = vi.fn();
    forwardIn = vi.fn();
    unforwardIn = vi.fn();
    constructor() {
      super();
      mockInstances.push(this);
    }
  }

  return { MockClient };
});

vi.mock('ssh2', () => ({ Client: MockClient }));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600, size: 1024 })),
}));
vi.mock('../../../src/config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    servers: [
      {
        id: 'jump-host',
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        auth: { password: 'jump-secret' },
      },
      {
        id: 'target-server',
        host: '10.0.0.5',
        port: 22,
        username: 'user',
        auth: { password: 'target-secret' },
      },
    ],
  })),
}));

function getMockClient(index: number): EventEmitter & { forwardOut: ReturnType<typeof vi.fn> } {
  return mockInstances[index] as EventEmitter & { forwardOut: ReturnType<typeof vi.fn> };
}

function createMockChannel(): ClientChannel {
  return new EventEmitter() as ClientChannel & EventEmitter;
}

describe('jump_connect - basic', () => {
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let remoteForwardRegistry: RemoteForwardRegistry;
  let config: Config;

  const jumpServerConfig: ServerConfig = {
    id: 'jump-host',
    host: '192.168.1.1',
    port: 22,
    username: 'admin',
    auth: { password: 'jump-secret' },
  };

  const targetServerConfig: ServerConfig = {
    id: 'target-server',
    host: '10.0.0.5',
    port: 22,
    username: 'user',
    auth: { password: 'target-secret' },
  };

  beforeEach(() => {
    mockInstances.length = 0;
    pool = new ConnectionPool();
    forwardRegistry = new ForwardRegistry();
    remoteForwardRegistry = new RemoteForwardRegistry();
    config = { servers: [jumpServerConfig, targetServerConfig] };
  });

  it('connects to target through jump host', async () => {
    const { registerJumpConnectTool } = await import('../../../src/tools/jump-connect.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const jumpSession = new SessionKeeper(jumpServerConfig);
    const jumpMockClient = getMockClient(0);
    const mockChannel = createMockChannel();

    jumpMockClient.forwardOut.mockImplementation(
      (_srcHost, _srcPort, _dstHost, _dstPort, callback) => {
        setImmediate(() => callback(null, mockChannel));
      },
    );

    const connectPromise = jumpSession.connect();
    setImmediate(() => jumpMockClient.emit('ready'));
    await connectPromise;
    pool.add(jumpSession);

    const mockServer = createMockServer();
    registerJumpConnectTool(
      mockServer as unknown as McpServer,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('jump_connect')!;
    const resultPromise = handler({ jumpServerId: 'jump-host', targetServerId: 'target-server' });
    await new Promise((r) => setImmediate(r));
    const targetMockClient = getMockClient(1);
    setImmediate(() => targetMockClient.emit('ready'));

    const result = await resultPromise;
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('connected');
    expect(parsed.targetServerId).toBe('target-server');
    expect(parsed.jumpServerId).toBe('jump-host');
    expect(parsed.isJumpConnection).toBe(true);
  });

  it('returns error if jump host not connected', async () => {
    const { registerJumpConnectTool } = await import('../../../src/tools/jump-connect.js');

    const mockServer = createMockServer();
    registerJumpConnectTool(
      mockServer as unknown as McpServer,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('jump_connect')!;
    const result = await handler({ jumpServerId: 'jump-host', targetServerId: 'target-server' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Jump host 'jump-host' is not connected");
  });
});
