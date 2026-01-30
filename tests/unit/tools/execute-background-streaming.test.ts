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

async function createConnectedSession(ctx: TestContext) {
  const { SessionKeeper } = await import('../../../src/ssh/session.js');
  const session = new SessionKeeper(ctx.serverConfig);
  const mockClient = getMockClient(mockInstances) as MockClientType;
  const connectPromise = session.connect();
  setImmediate(() => mockClient.emit('ready'));
  await connectPromise;
  ctx.pool.add(session);
  return { session };
}

async function setupTool(ctx: TestContext, shellRegistry: ShellRegistry, jobRegistry: JobRegistry) {
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
  return mockServer.getToolHandler('execute_background')!;
}

describe('execute_background streaming wiring', () => {
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

  it('passes onOutput callback to shell.execute', async () => {
    const handler = await setupTool(ctx, shellRegistry, jobRegistry);
    await handler({ serverId: 'test-server', command: 'echo streaming' });
    await vi.waitFor(() => expect(mockExecute).toHaveBeenCalled());
    const executeCall = mockExecute.mock.calls[0];
    expect(executeCall[1]).toHaveProperty('onOutput');
    expect(typeof executeCall[1].onOutput).toBe('function');
  });

  it('onOutput callback appends to job registry', async () => {
    const handler = await setupTool(ctx, shellRegistry, jobRegistry);
    const result = await handler({ serverId: 'test-server', command: 'echo test' });
    await vi.waitFor(() => expect(mockExecute).toHaveBeenCalled());
    const parsed = JSON.parse(result.content[0].text);
    const onOutput = mockExecute.mock.calls[0][1].onOutput as (chunk: string) => void;
    onOutput('first chunk');
    onOutput('second chunk');
    const job = jobRegistry.get(parsed.jobId);
    expect(job?.output).toBe('first chunksecond chunk');
    expect(job?.bytesReceived).toBe(23);
  });

  it('tracks bytesReceived and lastOutputAt via onOutput', async () => {
    const handler = await setupTool(ctx, shellRegistry, jobRegistry);
    const result = await handler({ serverId: 'test-server', command: 'echo test' });
    await vi.waitFor(() => expect(mockExecute).toHaveBeenCalled());
    const parsed = JSON.parse(result.content[0].text);
    const onOutput = mockExecute.mock.calls[0][1].onOutput as (chunk: string) => void;
    const beforeOutput = Date.now();
    onOutput('test data');
    const afterOutput = Date.now();
    const job = jobRegistry.get(parsed.jobId);
    expect(job?.bytesReceived).toBe(9);
    expect(job?.lastOutputAt).toBeGreaterThanOrEqual(beforeOutput);
    expect(job?.lastOutputAt).toBeLessThanOrEqual(afterOutput);
  });

  it('streaming works with stallTimeout disabled', async () => {
    const handler = await setupTool(ctx, shellRegistry, jobRegistry);
    await handler({ serverId: 'test-server', command: 'long running command', stallTimeout: 0 });
    await vi.waitFor(() => expect(mockExecute).toHaveBeenCalled());
    const executeCall = mockExecute.mock.calls[0];
    expect(executeCall[1].stallTimeoutMs).toBeNull();
    expect(executeCall[1]).toHaveProperty('onOutput');
  });

  it('streaming works with custom timeout', async () => {
    const handler = await setupTool(ctx, shellRegistry, jobRegistry);
    await handler({ serverId: 'test-server', command: 'echo test', timeout: 300 });
    await vi.waitFor(() => expect(mockExecute).toHaveBeenCalled());
    const executeCall = mockExecute.mock.calls[0];
    expect(executeCall[1].timeoutMs).toBe(300000);
    expect(executeCall[1]).toHaveProperty('onOutput');
  });
});
