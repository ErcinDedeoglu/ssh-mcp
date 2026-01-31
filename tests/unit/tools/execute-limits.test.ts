import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../../../src/config/types.js';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
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
    hasAgentForward: false,
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

describe('execute output limits', () => {
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

  it('returns error when output exceeds MAX_OUTPUT_SIZE', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');
    const { MAX_OUTPUT_SIZE } = await import('../../../src/ssh/shell-session.types.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockExecute.mockRejectedValue(new Error(`Output exceeded ${MAX_OUTPUT_SIZE} bytes limit`));

    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'cat large-file' });

    expect(result.isError).toBe(true);
    const errorText = result.content[0].text;
    expect(errorText).toContain('Output exceeded');
    expect(errorText).toContain('bytes limit');
  });

  it('returns connection_failed when new connection attempt fails', async () => {
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
    const resultPromise = handler({ serverId: 'test-server', command: 'ls' });

    await new Promise((r) => setImmediate(r));
    const newMockClient = getMockClient(mockInstances) as MockClientType;
    newMockClient.emit('error', new Error('Connection refused'));

    const result = await resultPromise;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('connection_failed');
  });
});
