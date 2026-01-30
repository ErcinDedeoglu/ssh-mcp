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

describe.skipIf(!isDockerRunning())('E2E close_remote_forward Tool', () => {
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

  it('closes existing remote forward', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { registerCloseRemoteForwardTool } =
      await import('../../../src/tools/close-remote-forward.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );
    registerCloseRemoteForwardTool(mockServer as never, pool, remoteForwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_remote_port')!;
    const forwardResult = await forwardHandler({
      serverId: 'test-server-1',
      localHost: 'localhost',
      localPort: 8080,
      remotePort: 19999,
    });

    expect(forwardResult.isError).toBeUndefined();
    const forwardParsed = JSON.parse(forwardResult.content[0].text);
    const boundPort = forwardParsed.remotePort;

    expect(remoteForwardRegistry.get('test-server-1', '127.0.0.1', boundPort)).toBeDefined();

    const closeHandler = mockServer.getToolHandler('close_remote_forward')!;
    const closeResult = await closeHandler({
      serverId: 'test-server-1',
      remotePort: boundPort,
    });

    expect(closeResult.isError).toBeUndefined();
    const closeParsed = JSON.parse(closeResult.content[0].text);
    expect(closeParsed.status).toBe('closed');
    expect(remoteForwardRegistry.get('test-server-1', '127.0.0.1', boundPort)).toBeUndefined();

    pool.clear();
  });

  it('returns error for non-existent forward', async () => {
    const { registerCloseRemoteForwardTool } =
      await import('../../../src/tools/close-remote-forward.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerCloseRemoteForwardTool(mockServer as never, pool, remoteForwardRegistry);

    const handler = mockServer.getToolHandler('close_remote_forward')!;
    const result = await handler({
      serverId: 'test-server-1',
      remotePort: 99999,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('99999');
    expect(result.content[0].text.toLowerCase()).toContain('no active remote forward');
  });

  it('accepts custom remoteHost parameter', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { registerCloseRemoteForwardTool } =
      await import('../../../src/tools/close-remote-forward.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );
    registerCloseRemoteForwardTool(mockServer as never, pool, remoteForwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_remote_port')!;
    const forwardResult = await forwardHandler({
      serverId: 'test-server-1',
      localHost: 'localhost',
      localPort: 3000,
      remoteHost: '127.0.0.1',
      remotePort: 18888,
    });

    expect(forwardResult.isError).toBeUndefined();
    const forwardParsed = JSON.parse(forwardResult.content[0].text);
    const boundPort = forwardParsed.remotePort;

    const closeHandler = mockServer.getToolHandler('close_remote_forward')!;
    const result = await closeHandler({
      serverId: 'test-server-1',
      remotePort: boundPort,
      remoteHost: '127.0.0.1',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('closed');

    pool.clear();
  });

  it('returns forward info in close response', async () => {
    const { registerForwardRemotePortTool } =
      await import('../../../src/tools/forward-remote-port.js');
    const { registerCloseRemoteForwardTool } =
      await import('../../../src/tools/close-remote-forward.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardRemotePortTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      remoteForwardRegistry,
    );
    registerCloseRemoteForwardTool(mockServer as never, pool, remoteForwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_remote_port')!;
    const forwardResult = await forwardHandler({
      serverId: 'test-server-1',
      localHost: 'localhost',
      localPort: 5000,
      remotePort: 17777,
    });

    expect(forwardResult.isError).toBeUndefined();
    const forwardParsed = JSON.parse(forwardResult.content[0].text);
    const boundPort = forwardParsed.remotePort;

    const closeHandler = mockServer.getToolHandler('close_remote_forward')!;
    const result = await closeHandler({
      serverId: 'test-server-1',
      remotePort: boundPort,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.serverId).toBe('test-server-1');
    expect(parsed.localHost).toBe('localhost');
    expect(parsed.localPort).toBe(5000);

    pool.clear();
  });
});
