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
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E list_forwards Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let remoteForwardRegistry: RemoteForwardRegistry;
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
    remoteForwardRegistry = new RemoteForwardRegistry();
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

  it('returns empty list when no forwards exist', async () => {
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerListForwardsTool(mockServer as never, forwardRegistry, remoteForwardRegistry);

    const handler = mockServer.getToolHandler('list_forwards')!;
    const result = await handler({});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.localCount).toBe(0);
    expect(parsed.remoteCount).toBe(0);
    expect(parsed.forwards).toHaveLength(0);
  });

  it('lists local port forwards', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);
    registerListForwardsTool(mockServer as never, forwardRegistry, remoteForwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_port')!;
    await forwardHandler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 22,
    });

    const listHandler = mockServer.getToolHandler('list_forwards')!;
    const result = await listHandler({});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.localCount).toBe(1);
    expect(parsed.forwards[0].type).toBe('local');
    expect(parsed.forwards[0].remotePort).toBe(22);

    forwardRegistry.clear();
    pool.clear();
  });

  it('filters by serverId', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);
    registerListForwardsTool(mockServer as never, forwardRegistry, remoteForwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_port')!;
    await forwardHandler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 22,
    });

    const listHandler = mockServer.getToolHandler('list_forwards')!;
    const result = await listHandler({ serverId: 'nonexistent-server' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);

    forwardRegistry.clear();
    pool.clear();
  });

  it('includes connection string in forward info', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { registerListForwardsTool } = await import('../../../src/tools/list-forwards.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);
    registerListForwardsTool(mockServer as never, forwardRegistry, remoteForwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_port')!;
    await forwardHandler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 80,
      localPort: 18080,
    });

    const listHandler = mockServer.getToolHandler('list_forwards')!;
    const result = await listHandler({});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.forwards[0].connectionString).toContain('18080');
    expect(parsed.forwards[0].connectionString).toContain('80');

    forwardRegistry.clear();
    pool.clear();
  });
});
