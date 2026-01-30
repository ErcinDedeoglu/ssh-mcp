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

describe.skipIf(!isDockerRunning())('E2E Auto-Connect - Tools', () => {
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

  describe('execute tool', () => {
    it('auto-connects and executes command on fresh pool', async () => {
      const { registerExecuteTool } = await import('../../../src/tools/execute.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const mockServer = createMockServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerExecuteTool(mockServer as any, config, pool, forwardRegistry, shellRegistry);

      const handler = mockServer.getToolHandler('execute')!;
      expect(pool.get('test-server-1')).toBeUndefined();

      const result = await handler({
        serverId: 'test-server-1',
        command: 'echo "auto-connect works"',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stdout).toContain('auto-connect works');
      expect(parsed.exitCode).toBe(0);
      expect(pool.get('test-server-1')).toBeDefined();

      pool.clear();
      shellRegistry.clear();
    });

    it('multiple execute calls reuse same connection', async () => {
      const { registerExecuteTool } = await import('../../../src/tools/execute.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const mockServer = createMockServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerExecuteTool(mockServer as any, config, pool, forwardRegistry, shellRegistry);

      const handler = mockServer.getToolHandler('execute')!;

      await handler({ serverId: 'test-server-1', command: 'echo first' });
      const sessionAfterFirst = pool.get('test-server-1');

      await handler({ serverId: 'test-server-1', command: 'echo second' });
      const sessionAfterSecond = pool.get('test-server-1');

      expect(sessionAfterFirst).toBe(sessionAfterSecond);

      pool.clear();
      shellRegistry.clear();
    });
  });

  describe('connection_status tool', () => {
    it('auto-connects and returns health status', async () => {
      const { registerConnectionStatusTool } =
        await import('../../../src/tools/connection-status.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const mockServer = createMockServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerConnectionStatusTool(mockServer as any, config, pool, forwardRegistry);

      const handler = mockServer.getToolHandler('connection_status')!;
      expect(pool.get('test-server-1')).toBeUndefined();

      const result = await handler({ serverId: 'test-server-1' });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.connected).toBe(true);
      expect(parsed.serverId).toBe('test-server-1');
      expect(pool.get('test-server-1')).toBeDefined();

      pool.clear();
    });
  });

  describe('forward_port tool', () => {
    it('auto-connects for port forwarding', async () => {
      const { registerForwardPortTool } = await import('../../../src/tools/forward-port.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const mockServer = createMockServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerForwardPortTool(mockServer as any, config, pool, forwardRegistry);

      const handler = mockServer.getToolHandler('forward_port')!;
      expect(pool.get('test-server-1')).toBeUndefined();

      const result = await handler({
        serverId: 'test-server-1',
        remoteHost: 'localhost',
        remotePort: 22,
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('forwarding');
      expect(pool.get('test-server-1')).toBeDefined();

      forwardRegistry.clear();
      pool.clear();
    });
  });
});
