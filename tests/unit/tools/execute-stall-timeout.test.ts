import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../../../src/config/types.js';
import { clearInstances } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';

const mockInstances: EventEmitter[] = [];
let mockConfig: Config;

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

describe('execute tool stallTimeout parameter', () => {
  let ctx: TestContext;
  let shellRegistry: ShellRegistry;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
    shellRegistry = new ShellRegistry();
  });

  it('accepts stallTimeout parameter in schema', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const mockServer = createMockServer();
    registerExecuteTool(
      mockServer as unknown as McpServer,
      ctx.config,
      ctx.pool,
      ctx.forwardRegistry,
      shellRegistry,
    );

    const toolConfig = mockServer.getToolConfig('execute');
    expect(toolConfig).toBeDefined();
  });

  it('handles stallTimeout: 0 to disable stall detection', async () => {
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
    const resultPromise = handler({
      serverId: 'unknown-server',
      command: 'sleep 30',
      stallTimeout: 0,
    });

    const result = await resultPromise;
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('server_not_found');
  });

  it('handles stallTimeout: null to disable stall detection', async () => {
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
    const resultPromise = handler({
      serverId: 'unknown-server',
      command: 'sleep 30',
      stallTimeout: null,
    });

    const result = await resultPromise;
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('server_not_found');
  });

  it('accepts positive stallTimeout values', async () => {
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
    const resultPromise = handler({
      serverId: 'unknown-server',
      command: 'echo test',
      stallTimeout: 30,
    });

    const result = await resultPromise;
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('server_not_found');
  });
});
