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

describe('ensureConnected - handlers and formatting', () => {
  let ctx: TestContext;

  beforeEach(() => {
    clearInstances(mockInstances);
    ctx = createTestContext();
    mockConfig = ctx.config;
  });

  describe('disconnect event handler', () => {
    it('cleans up forward registry on disconnect', async () => {
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockServer = new EventEmitter() as any;
      mockServer.close = vi.fn();
      ctx.forwardRegistry.add({
        serverId: 'test-server',
        localHost: '127.0.0.1',
        localPort: 5432,
        remoteHost: 'db.internal',
        remotePort: 5432,
        server: mockServer,
        activeSockets: new Set(),
        createdAt: Date.now(),
      });

      expect(ctx.forwardRegistry.listByServer('test-server').length).toBe(1);

      if (result.success) {
        result.session.emit('disconnected');
      }

      expect(ctx.forwardRegistry.listByServer('test-server').length).toBe(0);
    });
  });

  describe('refreshConfig', () => {
    it('reloads config from disk before checking server', async () => {
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

      mockConfig.servers.push({
        id: 'new-server',
        host: '10.0.0.1',
        port: 22,
        username: 'admin',
        auth: { password: 'pass' },
      });

      const resultPromise = ensureConnected('new-server', {
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
        expect(result.serverConfig.host).toBe('10.0.0.1');
      }
    });
  });

  describe('formatConnectionError', () => {
    it('formats error info as MCP error response', async () => {
      const { formatConnectionError } = await import('../../../src/tools/ensure-connected.js');

      const result = formatConnectionError({
        error: 'server_not_found',
        serverId: 'missing',
        reason: 'Server not in config',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('server_not_found');
      expect(parsed.serverId).toBe('missing');
    });

    it('includes host/port/username when provided', async () => {
      const { formatConnectionError } = await import('../../../src/tools/ensure-connected.js');

      const result = formatConnectionError({
        error: 'connection_failed',
        serverId: 'test',
        host: '10.0.0.1',
        port: 22,
        username: 'admin',
        reason: 'Auth failed',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.host).toBe('10.0.0.1');
      expect(parsed.port).toBe(22);
      expect(parsed.username).toBe('admin');
    });
  });
});
