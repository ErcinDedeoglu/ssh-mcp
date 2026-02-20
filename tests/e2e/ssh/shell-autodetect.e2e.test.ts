// E2E: Shell auto-detection against real Linux SSH servers.
// Verifies: detectShellType resolves to 'posix', ShellSession.shellType getter,
// execute tool works with auto-detected shell, multiple servers detect consistently.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  SessionKeeper,
  type TestContext,
  loadTestConfigFull,
  getShardConfigPath,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E Shell Auto-Detection', () => {
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

  describe('ShellSession level', () => {
    it('auto-detects posix shell on Linux SSH server', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({ shellType: 'auto' });
      await shell.initialize(session.client);

      expect(shell.shellType).toBe('posix');
      expect(shell.isReady).toBe(true);

      session.disconnect();
    });

    it('defaults to auto when no shellType specified', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({});
      expect(shell.shellType).toBe('auto');

      await shell.initialize(session.client);
      expect(shell.shellType).toBe('posix');

      session.disconnect();
    });

    it('auto-detects consistently across different servers', async () => {
      const s1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      const s2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
      await Promise.all([s1.connect(), s2.connect()]);

      const shell1 = new ShellSession({});
      const shell2 = new ShellSession({});
      await shell1.initialize(s1.client);
      await shell2.initialize(s2.client);

      expect(shell1.shellType).toBe('posix');
      expect(shell2.shellType).toBe('posix');

      s1.disconnect();
      s2.disconnect();
    });

    it('auto-detects on key-auth server', async () => {
      const session = new SessionKeeper(ctx.serverKeyConfig, { maxReconnectAttempts: 0 });
      await session.connect();

      const shell = new ShellSession({});
      await shell.initialize(session.client);

      expect(shell.shellType).toBe('posix');

      session.disconnect();
    });
  });

  describe('execute tool level', () => {
    it('auto-detects and executes commands via tool handler', async () => {
      const { registerExecuteTool } = await import('../../../src/tools/execute.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const mockServer = createMockServer();
      registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
      const handler = mockServer.getToolHandler('execute')!;

      const result = await handler({ serverId: 'test-server-1', command: 'echo hello' });
      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stdout).toContain('hello');
      expect(parsed.exitCode).toBe(0);

      // Verify the shell was registered with detected type
      const shell = shellRegistry.get('test-server-1');
      expect(shell).toBeDefined();
      expect(shell!.shellType).toBe('posix');

      pool.clear();
      shellRegistry.clear();
    });

    it('reuses auto-detected shell across multiple commands', async () => {
      const { registerExecuteTool } = await import('../../../src/tools/execute.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const mockServer = createMockServer();
      registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
      const handler = mockServer.getToolHandler('execute')!;

      await handler({ serverId: 'test-server-1', command: 'export MY_VAR=42' });
      const result = await handler({ serverId: 'test-server-1', command: 'echo $MY_VAR' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stdout.trim()).toBe('42');

      pool.clear();
      shellRegistry.clear();
    });

    it('uses explicit posix shell override without regression', async () => {
      // Config with explicit shell='posix' should work the same as auto-detected
      const explicitConfig = loadTestConfigFull();
      explicitConfig.servers[0].shell = 'posix';

      const { registerExecuteTool } = await import('../../../src/tools/execute.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const mockServer = createMockServer();
      registerExecuteTool(
        mockServer as never,
        explicitConfig,
        pool,
        forwardRegistry,
        shellRegistry,
      );
      const handler = mockServer.getToolHandler('execute')!;

      const result = await handler({ serverId: 'test-server-1', command: 'echo explicit' });
      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stdout).toContain('explicit');

      const shell = shellRegistry.get('test-server-1');
      expect(shell!.shellType).toBe('posix');

      pool.clear();
      shellRegistry.clear();
    });
  });
});
