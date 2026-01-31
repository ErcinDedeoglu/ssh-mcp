import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../../../src/config/types.js';
import { clearInstances, getMockClient, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';

const mockInstances: EventEmitter[] = [];
let mockConfig: Config;

const mockInitialize = vi.fn();
const mockExecute = vi.fn();
const mockDestroy = vi.fn();

vi.mock('../../../src/ssh/shell-session.js', () => ({
  ShellSession: vi.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    execute: mockExecute,
    isReady: true,
    destroy: mockDestroy,
  })),
}));

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');
  class MockClient extends EE {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    shell = vi.fn();
    sftp = vi.fn();
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
  loadConfig: () => JSON.parse(JSON.stringify(mockConfig)),
}));

describe('execute - resolveTimeoutMs', () => {
  let ctx: TestContext;
  let shellRegistry: ShellRegistry;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
    shellRegistry = new ShellRegistry();
    mockInitialize.mockClear();
    mockExecute.mockClear();
    mockDestroy.mockClear();
  });

  async function setupConnectedSession(serverConfig = ctx.serverConfig) {
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const session = new SessionKeeper(serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);
    return session;
  }

  it('uses timeout parameter when provided', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    await setupConnectedSession();

    mockExecute.mockResolvedValue({ stdout: 'output', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    await handler({ serverId: 'test-server', command: 'ls', timeout: 120 });

    expect(mockExecute).toHaveBeenCalledWith('ls', {
      timeoutMs: 120000,
      stallTimeoutMs: undefined,
      stdin: undefined,
    });
  });

  it('uses server config timeout when parameter not provided', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    await setupConnectedSession();

    mockExecute.mockResolvedValue({ stdout: 'output', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    await handler({ serverId: 'test-server', command: 'ls' });

    expect(mockExecute).toHaveBeenCalledWith('ls', {
      timeoutMs: 30000,
      stallTimeoutMs: undefined,
      stdin: undefined,
    });
  });

  it('uses global config timeout when server config not provided', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');

    const serverConfigNoTimeout = { ...ctx.serverConfig, timeouts: undefined };
    ctx.config.servers[0] = serverConfigNoTimeout;
    await setupConnectedSession(serverConfigNoTimeout);

    mockExecute.mockResolvedValue({ stdout: 'output', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    await handler({ serverId: 'test-server', command: 'ls' });

    expect(mockExecute).toHaveBeenCalledWith('ls', {
      timeoutMs: 60000,
      stallTimeoutMs: undefined,
      stdin: undefined,
    });
  });

  it('uses default timeout when no config provided', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');

    const serverConfigNoTimeout = { ...ctx.serverConfig, timeouts: undefined };
    await setupConnectedSession(serverConfigNoTimeout);

    const configNoDefaults = {
      ...ctx.config,
      servers: [serverConfigNoTimeout],
      defaults: undefined,
    };
    mockConfig = configNoDefaults;

    mockExecute.mockResolvedValue({ stdout: 'output', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      configNoDefaults,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    await handler({ serverId: 'test-server', command: 'ls' });

    expect(mockExecute).toHaveBeenCalledWith('ls', {
      timeoutMs: 60000,
      stallTimeoutMs: undefined,
      stdin: undefined,
    });
  });
});
