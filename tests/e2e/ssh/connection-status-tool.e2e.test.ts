import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { loadConfig } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/types.js';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

describe.skipIf(!isDockerRunning())('E2E connection_status Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
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

  it('auto-connects and returns health status', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as never, config, pool, forwardRegistry);

    expect(pool.has('test-server-1')).toBe(false);

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'test-server-1' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.serverId).toBe('test-server-1');
    expect(parsed.connected).toBe(true);
    expect(pool.has('test-server-1')).toBe(true);

    pool.clear();
  });

  it('returns status for already connected server', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'test-server-1' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.connected).toBe(true);
    expect(parsed.idle).toBe(false);
    expect(parsed.reconnecting).toBe(false);

    pool.clear();
  });

  it('returns lastActivityAgo in human-readable format', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'test-server-1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.lastActivityAgo).toBeDefined();
    expect(typeof parsed.lastActivityAgo).toBe('string');
    expect(parsed.lastActivityMs).toBeGreaterThan(0);

    pool.clear();
  });

  it('returns error for invalid serverId', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'nonexistent-server' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nonexistent-server');
  });

  it('reuses existing connection from pool', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('connection_status')!;

    await handler({ serverId: 'test-server-1' });
    const sessionAfterFirst = pool.get('test-server-1');

    await handler({ serverId: 'test-server-1' });
    const sessionAfterSecond = pool.get('test-server-1');

    expect(sessionAfterFirst).toBe(sessionAfterSecond);
    expect(sessionAfterFirst).toBe(session);

    pool.clear();
  });

  it('returns correct status structure', async () => {
    const { registerConnectionStatusTool } =
      await import('../../../src/tools/connection-status.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerConnectionStatusTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('connection_status')!;
    const result = await handler({ serverId: 'test-server-1' });

    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty('serverId');
    expect(parsed).toHaveProperty('connected');
    expect(parsed).toHaveProperty('idle');
    expect(parsed).toHaveProperty('reconnecting');
    expect(parsed).toHaveProperty('lastActivityMs');
    expect(parsed).toHaveProperty('lastActivityAgo');

    pool.clear();
  });
});
