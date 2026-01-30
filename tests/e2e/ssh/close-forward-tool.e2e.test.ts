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
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E close_forward Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
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

  it('closes existing forward', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);
    registerCloseForwardTool(mockServer as never, forwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_port')!;
    const forwardResult = await forwardHandler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 22,
      localPort: 17777,
    });

    expect(forwardResult.isError).toBeUndefined();
    expect(forwardRegistry.get('127.0.0.1', 17777)).toBeDefined();

    const closeHandler = mockServer.getToolHandler('close_forward')!;
    const closeResult = await closeHandler({ localPort: 17777 });

    expect(closeResult.isError).toBeUndefined();
    const parsed = JSON.parse(closeResult.content[0].text);
    expect(parsed.status).toBe('closed');
    expect(parsed.localPort).toBe(17777);
    expect(forwardRegistry.get('127.0.0.1', 17777)).toBeUndefined();

    pool.clear();
  });

  it('returns error for non-existent forward', async () => {
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerCloseForwardTool(mockServer as never, forwardRegistry);

    const handler = mockServer.getToolHandler('close_forward')!;
    const result = await handler({ localPort: 99999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('99999');
    expect(result.content[0].text.toLowerCase()).toContain('no active forward');
  });

  it('accepts custom localHost parameter', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);
    registerCloseForwardTool(mockServer as never, forwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_port')!;
    await forwardHandler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 22,
      localPort: 17778,
      localHost: '127.0.0.1',
    });

    const closeHandler = mockServer.getToolHandler('close_forward')!;
    const result = await closeHandler({
      localPort: 17778,
      localHost: '127.0.0.1',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('closed');

    pool.clear();
  });

  it('returns forward info in close response', async () => {
    const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
    const { registerCloseForwardTool } = await import('../../../src/tools/close-forward.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerForwardPortTool(mockServer as never, config, pool, forwardRegistry);
    registerCloseForwardTool(mockServer as never, forwardRegistry);

    const forwardHandler = mockServer.getToolHandler('forward_port')!;
    await forwardHandler({
      serverId: 'test-server-1',
      remoteHost: 'localhost',
      remotePort: 80,
      localPort: 17779,
    });

    const closeHandler = mockServer.getToolHandler('close_forward')!;
    const result = await closeHandler({ localPort: 17779 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.serverId).toBe('test-server-1');
    expect(parsed.remoteHost).toBe('localhost');
    expect(parsed.remotePort).toBe(80);

    pool.clear();
  });
});
