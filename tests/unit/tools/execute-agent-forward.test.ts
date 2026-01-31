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
const ShellSessionMock = vi.fn();
vi.mock('../../../src/ssh/shell-session.js', () => ({
  ShellSession: ShellSessionMock,
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

describe('execute - agentForward', () => {
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

    ShellSessionMock.mockImplementation(() => ({
      initialize: mockInitialize,
      execute: mockExecute,
      isReady: true,
      destroy: mockDestroy,
    }));
  });

  it('passes agentForward to ShellSession when config allows and param is true', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockExecute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    await handler({
      serverId: 'test-server',
      command: 'git clone git@github.com:test/repo.git',
      agentForward: true,
    });

    expect(ShellSessionMock).toHaveBeenCalledWith({ agentForward: true });
  });

  it('passes agentForward: false when param is not provided', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockExecute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

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

    expect(ShellSessionMock).toHaveBeenCalledWith({ agentForward: false });
  });

  it('ignores agentForward param when config disables it', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    ctx.serverConfig.agentForward = false;
    mockConfig.servers[0].agentForward = false;

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockExecute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    await handler({
      serverId: 'test-server',
      command: 'git clone git@github.com:test/repo.git',
      agentForward: true,
    });

    expect(ShellSessionMock).toHaveBeenCalledWith({ agentForward: false });
  });

  it('reuses existing shell without changing agentForward', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const existingShell = new ShellSession({ agentForward: false });
    shellRegistry.set('test-server', existingShell);

    mockExecute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    await handler({
      serverId: 'test-server',
      command: 'git clone',
      agentForward: true,
    });

    expect(ShellSessionMock).toHaveBeenCalledTimes(1);
  });
});
