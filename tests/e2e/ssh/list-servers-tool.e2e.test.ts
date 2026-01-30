import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  SessionKeeper,
  type TestContext,
  loadTestConfigFull,
  getShardConfigPath,
  getShardPorts,
} from './ssh.setup.js';
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E list_servers Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let config: Config;
  let originalConfigEnv: string | undefined;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = getShardConfigPath();
    ctx = createTestContext();
  });

  beforeEach(() => {
    pool = new ConnectionPool();
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

  it('returns all configured servers with connected=false when pool is empty', async () => {
    const { registerListServersTool } = await import('../../../src/tools/list-servers.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerListServersTool(mockServer as never, config, pool);

    const handler = mockServer.getToolHandler('list_servers')!;
    const result = await handler({});

    expect(result.isError).toBeUndefined();
    const servers = JSON.parse(result.content[0].text);

    expect(servers.length).toBeGreaterThanOrEqual(3);
    const server1 = servers.find((s: { id: string }) => s.id === 'test-server-1');
    expect(server1).toBeDefined();
    expect(server1.connected).toBe(false);
    expect(server1.host).toBe('localhost');
    expect(server1.port).toBe(getShardPorts().server1);
  });

  it('shows connected=true for servers in pool', async () => {
    const { registerListServersTool } = await import('../../../src/tools/list-servers.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const mockServer = createMockServer();
    registerListServersTool(mockServer as never, config, pool);

    const handler = mockServer.getToolHandler('list_servers')!;
    const result = await handler({});

    const servers = JSON.parse(result.content[0].text);
    const server1 = servers.find((s: { id: string }) => s.id === 'test-server-1');
    const server2 = servers.find((s: { id: string }) => s.id === 'test-server-2');

    expect(server1.connected).toBe(true);
    expect(server2.connected).toBe(false);

    pool.clear();
  });

  it('includes server description when present', async () => {
    const { registerListServersTool } = await import('../../../src/tools/list-servers.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerListServersTool(mockServer as never, config, pool);

    const handler = mockServer.getToolHandler('list_servers')!;
    const result = await handler({});

    const servers = JSON.parse(result.content[0].text);
    const serverWithDesc = servers.find((s: { description?: string }) => s.description);

    if (serverWithDesc) {
      expect(typeof serverWithDesc.description).toBe('string');
    }
  });

  it('returns correct structure for each server', async () => {
    const { registerListServersTool } = await import('../../../src/tools/list-servers.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerListServersTool(mockServer as never, config, pool);

    const handler = mockServer.getToolHandler('list_servers')!;
    const result = await handler({});

    const servers = JSON.parse(result.content[0].text);

    for (const server of servers) {
      expect(server).toHaveProperty('id');
      expect(server).toHaveProperty('host');
      expect(server).toHaveProperty('port');
      expect(server).toHaveProperty('username');
      expect(server).toHaveProperty('connected');
      expect(typeof server.id).toBe('string');
      expect(typeof server.host).toBe('string');
      expect(typeof server.port).toBe('number');
      expect(typeof server.username).toBe('string');
      expect(typeof server.connected).toBe('boolean');
    }
  });

  it('reflects connection state changes', async () => {
    const { registerListServersTool } = await import('../../../src/tools/list-servers.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerListServersTool(mockServer as never, config, pool);
    const handler = mockServer.getToolHandler('list_servers')!;

    const beforeResult = await handler({});
    const beforeServers = JSON.parse(beforeResult.content[0].text);
    const beforeServer1 = beforeServers.find((s: { id: string }) => s.id === 'test-server-1');
    expect(beforeServer1.connected).toBe(false);

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const afterResult = await handler({});
    const afterServers = JSON.parse(afterResult.content[0].text);
    const afterServer1 = afterServers.find((s: { id: string }) => s.id === 'test-server-1');
    expect(afterServer1.connected).toBe(true);

    pool.clear();
  });
});
