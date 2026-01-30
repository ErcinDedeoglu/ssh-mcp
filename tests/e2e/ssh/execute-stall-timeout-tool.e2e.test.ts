/**
 * E2E tests for execute tool stallTimeout parameter.
 * Tests the full agent flow: tool handler -> SSH -> response.
 */
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  type TestContext,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import { loadConfig } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/types.js';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

describe.skipIf(!isDockerRunning())('E2E Execute Tool - Stall Timeout', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let shellRegistry: ShellRegistry;
  let config: Config;
  let originalConfigEnv: string | undefined;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = TEST_CONFIG_PATH;
    ctx = createTestContext();
  });

  beforeEach(() => {
    pool = new ConnectionPool();
    forwardRegistry = new ForwardRegistry();
    shellRegistry = new ShellRegistry();
    config = loadConfig();
  });

  afterAll(() => {
    if (originalConfigEnv !== undefined) {
      process.env.SSH_MCP_CONFIG = originalConfigEnv;
    } else {
      delete process.env.SSH_MCP_CONFIG;
    }
    ctx.pool.clear();
  });

  it('executes fast command with default stall timeout', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'echo "fast command"',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('fast command');
    expect(parsed.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  });

  it('allows silent command when stallTimeout is 0', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'sleep 2 && echo "done after silence"',
      stallTimeout: 0,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('done after silence');
    expect(parsed.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  }, 10000);

  it('allows silent command when stallTimeout is null', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'sleep 2 && echo "done with null"',
      stallTimeout: null,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('done with null');
    expect(parsed.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  }, 10000);

  it('triggers stall error with short stallTimeout on silent command', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'sleep 10',
      stallTimeout: 1,
    });

    expect(result.isError).toBe(true);
    // Error responses are plain text, not JSON
    const errorText = result.content[0].text;
    expect(errorText).toContain('stalled');

    pool.clear();
    shellRegistry.clear();
  }, 10000);

  it('resets stall timer when output is received', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    // Command outputs every 0.5s, stall timeout is 2s - should complete
    const result = await handler({
      serverId: 'test-server-1',
      command: 'for i in 1 2 3 4; do echo "tick $i"; sleep 0.5; done',
      stallTimeout: 2,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('tick 4');
    expect(parsed.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  }, 10000);
});
