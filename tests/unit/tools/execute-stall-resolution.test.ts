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

describe('execute - resolveStallTimeoutMs', () => {
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

  async function setupConnectedSession() {
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);
    return session;
  }

  it('returns null when stallTimeout is null', async () => {
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
    await handler({ serverId: 'test-server', command: 'ls', stallTimeout: null });

    expect(mockExecute).toHaveBeenCalledWith('ls', {
      timeoutMs: expect.any(Number),
      stallTimeoutMs: null,
      stdin: undefined,
    });
  });

  it('returns null when stallTimeout is 0', async () => {
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
    await handler({ serverId: 'test-server', command: 'ls', stallTimeout: 0 });

    expect(mockExecute).toHaveBeenCalledWith('ls', {
      timeoutMs: expect.any(Number),
      stallTimeoutMs: null,
      stdin: undefined,
    });
  });

  it('returns undefined when stallTimeout is undefined', async () => {
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
      timeoutMs: expect.any(Number),
      stallTimeoutMs: undefined,
      stdin: undefined,
    });
  });

  it('converts number to milliseconds when stallTimeout is a positive number', async () => {
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
    await handler({ serverId: 'test-server', command: 'ls', stallTimeout: 30 });

    expect(mockExecute).toHaveBeenCalledWith('ls', {
      timeoutMs: expect.any(Number),
      stallTimeoutMs: 30000,
      stdin: undefined,
    });
  });
});
