import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

function getMockClient(index: number): EventEmitter {
  return mockInstances[index] as EventEmitter;
}

describe('jump_connect - errors', () => {
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

  it('returns error if target server not in config', async () => {
    const { registerJumpConnectTool } = await import('../../../src/tools/jump-connect.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const jumpSession = new SessionKeeper(jumpServerConfig);
    const jumpMockClient = getMockClient(0);

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
    const result = await handler({ jumpServerId: 'jump-host', targetServerId: 'unknown-server' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Target server 'unknown-server' not found");
  });

  it('returns already_connected if target already in pool', async () => {
    const { registerJumpConnectTool } = await import('../../../src/tools/jump-connect.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const jumpSession = new SessionKeeper(jumpServerConfig);
    const jumpMockClient = getMockClient(0);
    const connectPromise1 = jumpSession.connect();
    setImmediate(() => jumpMockClient.emit('ready'));
    await connectPromise1;
    pool.add(jumpSession);

    const targetSession = new SessionKeeper(targetServerConfig);
    const targetMockClient = getMockClient(1);
    const connectPromise2 = targetSession.connect();
    setImmediate(() => targetMockClient.emit('ready'));
    await connectPromise2;
    pool.add(targetSession);

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

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('already_connected');
  });
});
