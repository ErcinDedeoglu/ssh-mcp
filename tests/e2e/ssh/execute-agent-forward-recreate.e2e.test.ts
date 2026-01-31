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

describe.skipIf(!isDockerRunning())('E2E Execute Tool - Agent Forward Recreate', () => {
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

  it('auto-recreates shell when agent forwarding requested on non-forwarding shell', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;

    const result1 = await handler({ serverId: 'test-server-1', command: 'echo first' });
    expect(result1.isError).toBeUndefined();
    expect(JSON.parse(result1.content[0].text).notice).toBeUndefined();
    expect(shellRegistry.get('test-server-1')!.hasAgentForward).toBe(false);

    const result2 = await handler({
      serverId: 'test-server-1',
      command: 'echo second',
      agentForward: true,
    });

    expect(result2.isError).toBeUndefined();
    const parsed2 = JSON.parse(result2.content[0].text);
    expect(parsed2.stdout).toContain('second');
    expect(parsed2.notice).toContain('Shell recreated with agent forwarding enabled');
    expect(shellRegistry.get('test-server-1')!.hasAgentForward).toBe(true);

    pool.clear();
    shellRegistry.clear();
  });

  it('does not recreate shell when agent forwarding already enabled', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;

    await handler({
      serverId: 'test-server-1',
      command: 'cd /tmp && export TEST_VAR=preserved',
      agentForward: true,
    });

    const result2 = await handler({
      serverId: 'test-server-1',
      command: 'echo $TEST_VAR && pwd',
      agentForward: true,
    });

    expect(result2.isError).toBeUndefined();
    const parsed2 = JSON.parse(result2.content[0].text);
    expect(parsed2.notice).toBeUndefined();
    expect(parsed2.stdout).toContain('preserved');
    expect(parsed2.stdout).toContain('/tmp');

    pool.clear();
    shellRegistry.clear();
  });

  it('preserves state when not requesting agent forwarding on forwarding shell', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;

    await handler({
      serverId: 'test-server-1',
      command: 'cd /tmp && export MY_STATE=kept',
      agentForward: true,
    });

    const result2 = await handler({
      serverId: 'test-server-1',
      command: 'echo $MY_STATE && pwd',
    });

    expect(result2.isError).toBeUndefined();
    const parsed2 = JSON.parse(result2.content[0].text);
    expect(parsed2.notice).toBeUndefined();
    expect(parsed2.stdout).toContain('kept');
    expect(parsed2.stdout).toContain('/tmp');

    pool.clear();
    shellRegistry.clear();
  });
});
