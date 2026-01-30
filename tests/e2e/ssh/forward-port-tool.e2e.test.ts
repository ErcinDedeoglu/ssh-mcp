import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  type TestContext,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { loadConfig } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/types.js';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

describe.skipIf(!isDockerRunning())('E2E forward_port Tool', () => {
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

  it('creates local port forward', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('forward_port')!;
    const result = await handler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 22,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('forwarding');
    expect(parsed.remoteHost).toBe('localhost');
    expect(parsed.remotePort).toBe(22);
    expect(parsed.localPort).toBeGreaterThan(0);

    forwardRegistry.clear();
    pool.clear();
  });

  it('auto-connects for port forwarding', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    expect(pool.has('test-server-1')).toBe(false);

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('forward_port')!;
    const result = await handler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 80,
    });

    expect(result.isError).toBeUndefined();
    expect(pool.has('test-server-1')).toBe(true);

    forwardRegistry.clear();
    pool.clear();
  });

  it('returns error for invalid server', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('forward_port')!;
    const result = await handler({
      serverId: 'nonexistent-server',
      remoteHost: 'localhost',
      remotePort: 22,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nonexistent-server');
  });

  it('allows specifying local port', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('forward_port')!;
    const result = await handler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 22,
      localPort: 19999,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.localPort).toBe(19999);

    forwardRegistry.clear();
    pool.clear();
  });
});
