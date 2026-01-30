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

describe('execute_background tool completion', () => {
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

  it('sets job result when command completes', async () => {
    mockExecute.mockResolvedValue({ stdout: 'done', stderr: '', exitCode: 0 });

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
      command: 'echo hello',
    });

    const parsed = JSON.parse(result.content[0].text);
    const jobId = parsed.jobId;

    await vi.waitFor(() => {
      const job = jobRegistry.get(jobId);
      return job?.status === 'completed';
    });

    const job = jobRegistry.get(jobId);
    expect(job?.status).toBe('completed');
    expect(job?.result).toEqual({ stdout: 'done', stderr: '', exitCode: 0 });
  });

  it('sets job error when command fails', async () => {
    mockExecute.mockRejectedValue(new Error('Connection lost'));

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
      command: 'bad command',
    });

    const parsed = JSON.parse(result.content[0].text);
    const jobId = parsed.jobId;

    await vi.waitFor(() => {
      const job = jobRegistry.get(jobId);
      return job?.status === 'failed';
    });

    const job = jobRegistry.get(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('Connection lost');
  });

  it('reuses existing shell session', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const existingShell = new (ShellSession as unknown as new () => object)();
    shellRegistry.set('test-server', existingShell as never);

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
      command: 'echo hello',
    });

    expect(mockInitialize).not.toHaveBeenCalled();
  });
});
