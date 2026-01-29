// Tests for execute MCP tool - core functionality
import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { homedir } from 'node:os';
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

describe('execute', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
  });

  it('runs command and returns stdout/stderr/exitCode', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockClient.exec.mockImplementation((_cmd: string, callback: ExecCallback) => {
      const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
      stream.stderr = new EventEmitter();
      setImmediate(() => {
        stream.emit('data', Buffer.from('Hello World\n'));
        stream.stderr.emit('data', Buffer.from(''));
        stream.emit('close', 0);
      });
      callback(null, stream);
    });

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'echo "Hello World"' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toBe('Hello World\n');
    expect(parsed.stderr).toBe('');
    expect(parsed.exitCode).toBe(0);
  });

  it('respects timeout configuration', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    mockClient.exec.mockImplementation((_cmd: string, callback: ExecCallback) => {
      const stream = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        destroy: () => void;
      };
      stream.stderr = new EventEmitter();
      stream.destroy = vi.fn();
      callback(null, stream);
    });

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server',
      command: 'sleep 100',
      timeout: 0.05,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('timed out');
  });

  it('sanitizes error messages', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { SessionKeeper } = await import('../../../src/ssh/session.js');

    const session = new SessionKeeper(ctx.serverConfig);
    const mockClient = getMockClient(mockInstances) as MockClientType;
    const connectPromise = session.connect();
    setImmediate(() => mockClient.emit('ready'));
    await connectPromise;
    ctx.pool.add(session);

    const homeDir = homedir();
    mockClient.exec.mockImplementation((_cmd: string, callback: ExecCallback) => {
      callback(new Error(`Failed at ${homeDir}/secret/script.sh with password=secret123`));
    });

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain(homeDir);
    expect(result.content[0].text).not.toContain('secret123');
    expect(result.content[0].text).toContain('~/secret/script.sh');
    expect(result.content[0].text).toContain('password=***');
  });

  it('returns error when not connected', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as unknown as McpServer, ctx.config, ctx.pool);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'ls' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active connection');
  });
});
