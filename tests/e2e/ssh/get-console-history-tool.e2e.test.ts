import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  SessionKeeper,
  type TestContext,
  loadTestConfigFull,
  getShardConfigPath,
} from './ssh.setup.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E get_console_history Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let shellRegistry: ShellRegistry;
  let forwardRegistry: ForwardRegistry;
  let config: Config;
  let originalConfigEnv: string | undefined;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = getShardConfigPath();
    ctx = createTestContext();
  });

  beforeEach(() => {
    pool = new ConnectionPool();
    shellRegistry = new ShellRegistry();
    forwardRegistry = new ForwardRegistry();
    config = loadTestConfigFull();
  });

  afterAll(() => {
    if (originalConfigEnv !== undefined) {
      process.env.SSH_MCP_CONFIG = originalConfigEnv;
    } else {
      delete process.env.SSH_MCP_CONFIG;
    }
    ctx.pool.clear();
  });

  it('returns error when no shell session exists', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerGetConsoleHistoryTool(mockServer as never, shellRegistry);

    const handler = mockServer.getToolHandler('get_console_history')!;
    const result = await handler({ serverId: 'test-server-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No shell session for server 'test-server-1'");
  });

  it('returns empty history for new shell with no commands executed', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const shell = new ShellSession();
    await shell.initialize(session.client);
    shellRegistry.set('test-server-1', shell);

    const mockServer = createMockServer();
    registerGetConsoleHistoryTool(mockServer as never, shellRegistry);

    const handler = mockServer.getToolHandler('get_console_history')!;
    const result = await handler({ serverId: 'test-server-1' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.history).toHaveLength(0);

    shellRegistry.clear();
    pool.clear();
  });

  it('returns history after executing commands', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    registerGetConsoleHistoryTool(mockServer as never, shellRegistry);

    const executeHandler = mockServer.getToolHandler('execute')!;
    await executeHandler({ serverId: 'test-server-1', command: 'echo "first"' });
    await executeHandler({ serverId: 'test-server-1', command: 'echo "second"' });

    const historyHandler = mockServer.getToolHandler('get_console_history')!;
    const result = await historyHandler({ serverId: 'test-server-1' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.history[0].command).toBe('echo "first"');
    expect(parsed.history[1].command).toBe('echo "second"');

    shellRegistry.clear();
    pool.clear();
  });

  it('respects limit parameter', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    registerGetConsoleHistoryTool(mockServer as never, shellRegistry);

    const executeHandler = mockServer.getToolHandler('execute')!;
    for (let i = 1; i <= 5; i++) {
      await executeHandler({ serverId: 'test-server-1', command: `echo "cmd${i}"` });
    }

    const historyHandler = mockServer.getToolHandler('get_console_history')!;
    const result = await historyHandler({ serverId: 'test-server-1', limit: 2 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.history).toHaveLength(2);

    shellRegistry.clear();
    pool.clear();
  });

  it('returns correct entry structure', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    registerGetConsoleHistoryTool(mockServer as never, shellRegistry);

    const executeHandler = mockServer.getToolHandler('execute')!;
    await executeHandler({ serverId: 'test-server-1', command: 'echo "test output"' });

    const historyHandler = mockServer.getToolHandler('get_console_history')!;
    const result = await historyHandler({ serverId: 'test-server-1' });

    const parsed = JSON.parse(result.content[0].text);
    const entry = parsed.history[0];

    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('command');
    expect(entry).toHaveProperty('stdout');
    expect(entry).toHaveProperty('exitCode');
    expect(entry).toHaveProperty('durationMs');
    expect(entry.exitCode).toBe(0);

    shellRegistry.clear();
    pool.clear();
  });
});
