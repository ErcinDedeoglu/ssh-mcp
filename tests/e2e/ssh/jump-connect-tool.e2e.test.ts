import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  type TestContext,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';
import { loadConfig } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/types.js';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

// Uses 'jump-target-internal' from config.test.json - connects via Docker internal hostname
const JUMP_TARGET_SERVER_ID = 'jump-target-internal';

describe.skipIf(!isDockerRunning())('E2E jump_connect Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let remoteForwardRegistry: RemoteForwardRegistry;
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
    remoteForwardRegistry = new RemoteForwardRegistry();
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

  it('connects to target through jump host', async () => {
    const { registerJumpConnectTool } = await import('../../../src/tools/jump-connect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerJumpConnectTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('jump_connect')!;
    const result = await handler({
      jumpServerId: 'test-server-1',
      targetServerId: JUMP_TARGET_SERVER_ID,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('connected');
    expect(parsed.targetServerId).toBe(JUMP_TARGET_SERVER_ID);
    expect(parsed.jumpServerId).toBe('test-server-1');
    expect(parsed.isJumpConnection).toBe(true);
    expect(pool.has(JUMP_TARGET_SERVER_ID)).toBe(true);

    pool.clear();
  });

  it('returns error for invalid jump server', async () => {
    const { registerJumpConnectTool } = await import('../../../src/tools/jump-connect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerJumpConnectTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('jump_connect')!;
    const result = await handler({
      jumpServerId: 'nonexistent-jump',
      targetServerId: JUMP_TARGET_SERVER_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nonexistent-jump');
  });

  it('returns error for invalid target server', async () => {
    const { registerJumpConnectTool } = await import('../../../src/tools/jump-connect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerJumpConnectTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('jump_connect')!;
    const result = await handler({
      jumpServerId: 'test-server-1',
      targetServerId: 'nonexistent-target',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('server_not_found');
    expect(parsed.serverId).toBe('nonexistent-target');

    pool.clear();
  });

  it('returns already_connected if target already connected', async () => {
    const { registerJumpConnectTool } = await import('../../../src/tools/jump-connect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerJumpConnectTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('jump_connect')!;

    const firstResult = await handler({
      jumpServerId: 'test-server-1',
      targetServerId: JUMP_TARGET_SERVER_ID,
    });
    expect(firstResult.isError).toBeUndefined();

    const secondResult = await handler({
      jumpServerId: 'test-server-1',
      targetServerId: JUMP_TARGET_SERVER_ID,
    });

    expect(secondResult.isError).toBeUndefined();
    const parsed = JSON.parse(secondResult.content[0].text);
    expect(parsed.status).toBe('already_connected');

    pool.clear();
  });
});
