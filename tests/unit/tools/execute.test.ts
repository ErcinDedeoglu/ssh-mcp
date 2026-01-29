import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { clearInstances } from './_fixtures/mock-client.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';

const mockInstances: EventEmitter[] = [];

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

describe('execute', () => {
  let ctx: TestContext;
  let shellRegistry: ShellRegistry;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    shellRegistry = new ShellRegistry();
  });

  it('returns error when not connected', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as unknown as McpServer, ctx.config, ctx.pool, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({ serverId: 'test-server', command: 'ls' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active connection');
  });

  it.todo('runs command via shell and returns result - covered by E2E tests');
});
