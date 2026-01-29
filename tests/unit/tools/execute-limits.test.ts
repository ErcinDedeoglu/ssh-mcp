// Tests for execute MCP tool - output size limits and connection state
import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import type { ExecCallback } from './_fixtures/types.js';

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

describe('execute output limits', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
  });

  it('returns error when stdout exceeds MAX_OUTPUT_SIZE', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;
    const oversizedData = Buffer.alloc(MAX_OUTPUT_SIZE + 1, 'x');

    mockClient.exec.mockImplementation((_cmd: string, callback: ExecCallback) => {
      const stream = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        destroy: () => void;
      };
      stream.stderr = new EventEmitter();
      stream.destroy = vi.fn();
      setImmediate(() => stream.emit('data', oversizedData));
      callback(null, stream);
    });

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'generate-large-output' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('exceeded');
  });

  it('returns error when stderr exceeds MAX_OUTPUT_SIZE', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;
    const oversizedData = Buffer.alloc(MAX_OUTPUT_SIZE + 1, 'x');

    mockClient.exec.mockImplementation((_cmd: string, callback: ExecCallback) => {
      const stream = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        destroy: () => void;
      };
      stream.stderr = new EventEmitter();
      stream.destroy = vi.fn();
      setImmediate(() => stream.stderr.emit('data', oversizedData));
      callback(null, stream);
    });

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'generate-large-stderr' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('stderr exceeded');
  });

  it('returns error when connection is not active', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig, { maxReconnectAttempts: 0 });
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockClient.emit('close');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'ls' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active connection');
  });
});
