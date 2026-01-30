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

describe.skipIf(!isDockerRunning())('E2E forward_remote_port Tool', () => {
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

  it('creates remote port forward', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_remote_port')!;
    const result = await handler({
      serverId: 'test-server-1',
      localHost: 'localhost',
      localPort: 8080,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('forwarding');
    expect(parsed.localHost).toBe('localhost');
    expect(parsed.localPort).toBe(8080);
    expect(parsed.remotePort).toBeGreaterThan(0);

    remoteForwardRegistry.clear();
    pool.clear();
  });

  it('auto-connects for remote port forwarding', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    expect(pool.has('test-server-1')).toBe(false);

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_remote_port')!;
    const result = await handler({
      serverId: 'test-server-1',
      localHost: 'localhost',
      localPort: 9090,
    });

    expect(result.isError).toBeUndefined();
    expect(pool.has('test-server-1')).toBe(true);

    remoteForwardRegistry.clear();
    pool.clear();
  });

  it('returns error for invalid server', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_remote_port')!;
    const result = await handler({
      serverId: 'nonexistent-server',
      localHost: 'localhost',
      localPort: 8080,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nonexistent-server');
  });

  it('allows specifying remote port', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );

    const handler = mockServer.getToolHandler('forward_remote_port')!;
    const result = await handler({
      serverId: 'test-server-1',
      localHost: 'localhost',
      localPort: 3000,
      remotePort: 18888,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.remotePort).toBe(18888);

    remoteForwardRegistry.clear();
    pool.clear();
  });
});
