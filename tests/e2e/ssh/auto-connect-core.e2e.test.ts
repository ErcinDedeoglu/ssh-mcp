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

describe.skipIf(!isDockerRunning())('E2E Auto-Connect - Core', () => {
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

  describe('ensureConnected', () => {
    it('auto-connects when no existing session in pool', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

      expect(pool.get('test-server-1')).toBeUndefined();

      const result = await ensureConnected('test-server-1', {
        config,
        pool,
        forwardRegistry,
        remoteForwardRegistry,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.session.isConnected).toBe(true);
        expect(pool.get('test-server-1')).toBeDefined();
      }

      pool.clear();
    });

    it('reuses existing connected session', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

      const result1 = await ensureConnected('test-server-1', {
        config,
        pool,
        forwardRegistry,
        remoteForwardRegistry,
      });
      expect(result1.success).toBe(true);

      const result2 = await ensureConnected('test-server-1', {
        config,
        pool,
        forwardRegistry,
        remoteForwardRegistry,
      });
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        expect(result1.session).toBe(result2.session);
      }

      pool.clear();
    });

    it('returns server_not_found for unknown server', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

      const result = await ensureConnected('non-existent-server', {
        config,
        pool,
        forwardRegistry,
        remoteForwardRegistry,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorInfo.error).toBe('server_not_found');
      }
    });
  });

  describe('cleanup on disconnect', () => {
    it('cleans up forward registry when session disconnects', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

      const result = await ensureConnected('test-server-1', {
        config,
        pool,
        forwardRegistry,
        remoteForwardRegistry,
      });
      expect(result.success).toBe(true);

      if (result.success) {
        const net = await import('node:net');
        const mockNetServer = new net.Server();
        forwardRegistry.add({
          serverId: 'test-server-1',
          localHost: '127.0.0.1',
          localPort: 19999,
          remoteHost: 'localhost',
          remotePort: 22,
          server: mockNetServer,
          activeSockets: new Set(),
          createdAt: Date.now(),
        });

        expect(forwardRegistry.listByServer('test-server-1').length).toBe(1);

        result.session.emit('disconnected');

        expect(forwardRegistry.listByServer('test-server-1').length).toBe(0);
      }

      pool.clear();
    });
  });
});
