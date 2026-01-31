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

describe('execute - basic', () => {
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

  it('returns server_not_found error for unknown server', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'unknown-server', command: 'ls' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('server_not_found');
  });

  it('executes command and returns result on success', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockExecute.mockResolvedValue({ stdout: 'hello world', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'echo hello' });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.serverId).toBe('test-server');
    expect(parsed.command).toBe('echo hello');
    expect(parsed.stdout).toBe('hello world');
    expect(parsed.stderr).toBe('');
    expect(parsed.exitCode).toBe(0);
    expect(session.lastActivity).toBeGreaterThan(0);
  });

  it('passes stdin to shell.execute when provided', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockExecute.mockResolvedValue({ stdout: 'file created', stderr: '', exitCode: 0 });

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
      command: 'cat > file.txt',
      stdin: 'test content',
    });

    expect(mockExecute).toHaveBeenCalledWith('cat > file.txt', {
      timeoutMs: expect.any(Number),
      stallTimeoutMs: undefined,
      stdin: 'test content',
    });
  });

  it('creates shell session and executes command via shell.execute', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockInitialize.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue({ stdout: 'file1.txt\nfile2.txt', stderr: '', exitCode: 0 });

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'ls -la' });

    expect(result.isError).toBeUndefined();
    expect(mockExecute).toHaveBeenCalledWith(
      'ls -la',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toBe('file1.txt\nfile2.txt');
    expect(parsed.exitCode).toBe(0);
  });
});
