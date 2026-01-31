import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  type TestContext,
  loadTestConfigFull,
  getShardConfigPath,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E Execute Tool - Agent Forward Basic', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let shellRegistry: ShellRegistry;
  let config: Config;
  let originalConfigEnv: string | undefined;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = getShardConfigPath();
    ctx = createTestContext();
  });

  beforeEach(() => {
    pool = new ConnectionPool();
    forwardRegistry = new ForwardRegistry();
    shellRegistry = new ShellRegistry();
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

  it('creates shell without agent forwarding by default', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'echo hello',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('hello');
    expect(parsed.exitCode).toBe(0);
    expect(parsed.notice).toBeUndefined();

    const shell = shellRegistry.get('test-server-1');
    expect(shell).toBeDefined();
    expect(shell!.hasAgentForward).toBe(false);

    pool.clear();
    shellRegistry.clear();
  });

  it('creates shell with agent forwarding when requested', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'echo hello',
      agentForward: true,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('hello');
    expect(parsed.exitCode).toBe(0);

    const shell = shellRegistry.get('test-server-1');
    expect(shell).toBeDefined();
    expect(shell!.hasAgentForward).toBe(true);

    pool.clear();
    shellRegistry.clear();
  });
});
