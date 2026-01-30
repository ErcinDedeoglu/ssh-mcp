import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Config } from '../../../src/config/types.js';
import { getMockClient, clearInstances, type MockClientType } from './_fixtures/mock-client.js';
import { createTestContext, type TestContext } from './_fixtures/test-setup.js';

const mockInstances: EventEmitter[] = [];
let mockConfig: Config;

const { MockClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events');
  class MockClient extends EE {
    connect = vi.fn();
    end = vi.fn();
    destroy = vi.fn();
    exec = vi.fn();
    sftp = vi.fn();
    constructor() {
      super();
      mockInstances.push(this);
    }
  }
  return { MockClient };
});

vi.mock('ssh2', () => ({ Client: MockClient }));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'fake-private-key-content'),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o100600, size: 1024 })),
}));
vi.mock('../../../src/config/loader.js', () => ({
  loadConfig: () => JSON.parse(JSON.stringify(mockConfig)),
}));

describe('ensureConnected - session states', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
  });

  describe('server_not_found', () => {
    it('returns server_not_found for unknown serverId', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

      const result = await ensureConnected('unknown-server', {
        config: ctx.config,
        pool: ctx.pool,
        forwardRegistry: ctx.forwardRegistry,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorInfo.error).toBe('server_not_found');
        expect(result.errorInfo.serverId).toBe('unknown-server');
        expect(result.errorInfo.reason).toContain('not found');
      }
    });

    it('includes serverId in error info', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

      const result = await ensureConnected('my-missing-server', {
        config: ctx.config,
        pool: ctx.pool,
        forwardRegistry: ctx.forwardRegistry,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorInfo.serverId).toBe('my-missing-server');
      }
    });
  });

  describe('existing connected session', () => {
    it('returns existing session if already connected', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');
      const { SessionKeeper } = await import('../../../src/ssh/session.js');

      const session = new SessionKeeper(ctx.serverConfig);
      const mockClient = getMockClient(mockInstances) as MockClientType;
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      ctx.pool.add(session);

      const result = await ensureConnected('test-server', {
        config: ctx.config,
        pool: ctx.pool,
        forwardRegistry: ctx.forwardRegistry,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.session).toBe(session);
        expect(result.serverConfig.id).toBe('test-server');
      }
    });

    it('does not create new connection for existing session', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');
      const { SessionKeeper } = await import('../../../src/ssh/session.js');

      const session = new SessionKeeper(ctx.serverConfig);
      const mockClient = getMockClient(mockInstances) as MockClientType;
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      ctx.pool.add(session);

      const initialCount = mockInstances.length;

      await ensureConnected('test-server', {
        config: ctx.config,
        pool: ctx.pool,
        forwardRegistry: ctx.forwardRegistry,
      });

      expect(mockInstances.length).toBe(initialCount);
    });
  });

  describe('reconnecting session', () => {
    it('returns session that is reconnecting', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');
      const { SessionKeeper } = await import('../../../src/ssh/session.js');

      const session = new SessionKeeper(ctx.serverConfig, { baseReconnectDelayMs: 10 });
      const mockClient = getMockClient(mockInstances) as MockClientType;
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      ctx.pool.add(session);

      const reconnectingPromise = new Promise<void>((resolve) => {
        session.once('reconnecting', () => resolve());
      });
      mockClient.emit('close');
      await reconnectingPromise;

      const result = await ensureConnected('test-server', {
        config: ctx.config,
        pool: ctx.pool,
        forwardRegistry: ctx.forwardRegistry,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.session).toBe(session);
        expect(result.session.healthCheck().reconnecting).toBe(true);
      }
    });
  });

  describe('disconnected session (not reconnecting)', () => {
    it('returns connection_failed for disconnected session not reconnecting', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');
      const { SessionKeeper } = await import('../../../src/ssh/session.js');

      const session = new SessionKeeper(ctx.serverConfig, { maxReconnectAttempts: 0 });
      const mockClient = getMockClient(mockInstances) as MockClientType;
      const connectPromise = session.connect();
      setImmediate(() => mockClient.emit('ready'));
      await connectPromise;
      ctx.pool.add(session);

      const maxRetriesPromise = new Promise<void>((resolve) => {
        session.once('max-retries-reached', () => resolve());
      });
      mockClient.emit('close');
      await maxRetriesPromise;

      ctx.pool.add(session);

      const result = await ensureConnected('test-server', {
        config: ctx.config,
        pool: ctx.pool,
        forwardRegistry: ctx.forwardRegistry,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorInfo.error).toBe('connection_failed');
        expect(result.errorInfo.reason).toContain('disconnected');
      }
    });
  });
});
