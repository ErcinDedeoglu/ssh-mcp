import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../../../src/config/types.js';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import { JobRegistry } from '../../../src/ssh/job-registry.js';

const mockInstances: EventEmitter[] = [];
let mockConfig: Config;

const mockExecute = vi.fn();
const mockInitialize = vi.fn();

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
vi.mock('../../../src/ssh/shell-session.js', () => ({
  ShellSession: vi.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    execute: mockExecute,
    isReady: true,
    destroy: vi.fn(),
  })),
}));

async function createConnectedSession(
  ctx: TestContext,
): Promise<{ session: InstanceType<typeof import('../../../src/ssh/session.js').SessionKeeper> }> {
  const { SessionKeeper } = await import('../../../src/ssh/session.js');
  const session = new SessionKeeper(ctx.serverConfig);
  const mockClient = getMockClient(mockInstances) as MockClientType;
  const connectPromise = session.connect();
  setImmediate(() => mockClient.emit('ready'));
  await connectPromise;
  ctx.pool.add(session);
  return { session };
}

describe('execute_background tool', () => {
  let ctx: TestContext;
  let shellRegistry: ShellRegistry;
  let jobRegistry: JobRegistry;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
    shellRegistry = new ShellRegistry();
    jobRegistry = new JobRegistry();
    mockExecute.mockClear();
    mockInitialize.mockClear();
    mockExecute.mockResolvedValue({ stdout: 'output', stderr: '', exitCode: 0 });
    mockInitialize.mockResolvedValue(undefined);
  });

  it('returns server_not_found for unknown server', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const mockServer = createMockServer();
    registerExecuteBackgroundTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
      jobRegistry,
    );

    const handler = mockServer.getToolHandler('execute_background')!;
    const result = await handler({
      serverId: 'unknown-server',
      command: 'echo hello',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('server_not_found');
  });

  it('creates job and returns job ID immediately', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const mockServer = createMockServer();
    registerExecuteBackgroundTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
      jobRegistry,
    );

    await createConnectedSession(ctx);

    const handler = mockServer.getToolHandler('execute_background')!;
    const result = await handler({
      serverId: 'test-server',
      command: 'sleep 10',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.jobId).toMatch(/^job_/);
    expect(parsed.serverId).toBe('test-server');
    expect(parsed.command).toBe('sleep 10');
    expect(parsed.status).toBe('running');
  });

  it('passes timeout parameter to shell execute', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const mockServer = createMockServer();
    registerExecuteBackgroundTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
      jobRegistry,
    );

    await createConnectedSession(ctx);

    const handler = mockServer.getToolHandler('execute_background')!;
    await handler({
      serverId: 'test-server',
      command: 'sleep 10',
      timeout: 120,
    });

    await vi.waitFor(() => expect(mockExecute).toHaveBeenCalled());
    expect(mockExecute).toHaveBeenCalledWith(
      'sleep 10',
      expect.objectContaining({ timeoutMs: 120000 }),
    );
  });

  it('uses server config timeout when not specified', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const mockServer = createMockServer();
    registerExecuteBackgroundTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
      jobRegistry,
    );

    await createConnectedSession(ctx);

    const handler = mockServer.getToolHandler('execute_background')!;
    await handler({
      serverId: 'test-server',
      command: 'echo test',
    });

    await vi.waitFor(() => expect(mockExecute).toHaveBeenCalled());
    expect(mockExecute).toHaveBeenCalledWith(
      'echo test',
      expect.objectContaining({ timeoutMs: 30000 }),
    );
  });
});
