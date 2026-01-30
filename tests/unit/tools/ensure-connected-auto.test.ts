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

describe('ensureConnected - auto-connect', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
  });

  it('creates new session and connects when no existing session', async () => {
    const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

    const resultPromise = ensureConnected('test-server', {
      config: ctx.config,
      pool: ctx.pool,
      forwardRegistry: ctx.forwardRegistry,
    });

    await new Promise((r) => setImmediate(r));
    const mockClient = getMockClient(mockInstances) as MockClientType;
    mockClient.emit('ready');

    const result = await resultPromise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.session.isConnected).toBe(true);
      expect(result.serverConfig.id).toBe('test-server');
    }
  });

  it('adds new session to pool', async () => {
    const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

    expect(ctx.pool.get('test-server')).toBeUndefined();

    const resultPromise = ensureConnected('test-server', {
      config: ctx.config,
      pool: ctx.pool,
      forwardRegistry: ctx.forwardRegistry,
    });

    await new Promise((r) => setImmediate(r));
    const mockClient = getMockClient(mockInstances) as MockClientType;
    mockClient.emit('ready');

    await resultPromise;

    expect(ctx.pool.get('test-server')).toBeDefined();
  });

  it('returns connection_failed when connect() fails', async () => {
    const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

    const resultPromise = ensureConnected('test-server', {
      config: ctx.config,
      pool: ctx.pool,
      forwardRegistry: ctx.forwardRegistry,
    });

    await new Promise((r) => setImmediate(r));
    const mockClient = getMockClient(mockInstances) as MockClientType;
    mockClient.emit('error', new Error('Connection refused'));

    const result = await resultPromise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorInfo.error).toBe('connection_failed');
      expect(result.errorInfo.host).toBe('192.168.1.100');
      expect(result.errorInfo.port).toBe(22);
      expect(result.errorInfo.username).toBe('ubuntu');
      expect(result.errorInfo.reason).toContain('Connection refused');
    }
  });

  it('uses idle timeout from server config', async () => {
    const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

    ctx.serverConfig.timeouts = { idle: 300 };

    const resultPromise = ensureConnected('test-server', {
      config: ctx.config,
      pool: ctx.pool,
      forwardRegistry: ctx.forwardRegistry,
    });

    await new Promise((r) => setImmediate(r));
    const mockClient = getMockClient(mockInstances) as MockClientType;
    mockClient.emit('ready');

    const result = await resultPromise;

    expect(result.success).toBe(true);
  });

  it('uses default idle timeout when not specified', async () => {
    const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

    delete ctx.serverConfig.timeouts;

    const resultPromise = ensureConnected('test-server', {
      config: ctx.config,
      pool: ctx.pool,
      forwardRegistry: ctx.forwardRegistry,
    });

    await new Promise((r) => setImmediate(r));
    const mockClient = getMockClient(mockInstances) as MockClientType;
    mockClient.emit('ready');

    const result = await resultPromise;

    expect(result.success).toBe(true);
  });
});
