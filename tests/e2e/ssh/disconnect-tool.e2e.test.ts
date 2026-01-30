import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E disconnect Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let shellRegistry: ShellRegistry;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    pool = new ConnectionPool();
    shellRegistry = new ShellRegistry();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  it('returns error for non-existent server', async () => {
    const { registerDisconnectTool } = await import('../../../src/tools/disconnect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerDisconnectTool(mockServer as never, pool, shellRegistry);

    const handler = mockServer.getToolHandler('disconnect')!;
    const result = await handler({ serverId: 'nonexistent-server' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No active connection to server 'nonexistent-server'");
  });

  it('disconnects connected server successfully', async () => {
    const { registerDisconnectTool } = await import('../../../src/tools/disconnect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    expect(pool.has('test-server-1')).toBe(true);

    const mockServer = createMockServer();
    registerDisconnectTool(mockServer as never, pool, shellRegistry);

    const handler = mockServer.getToolHandler('disconnect')!;
    const result = await handler({ serverId: 'test-server-1' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('disconnected');
    expect(parsed.serverId).toBe('test-server-1');
    expect(pool.has('test-server-1')).toBe(false);
  });

  it('returns shellHistoryCleared=false when no shell was active', async () => {
    const { registerDisconnectTool } = await import('../../../src/tools/disconnect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const mockServer = createMockServer();
    registerDisconnectTool(mockServer as never, pool, shellRegistry);

    const handler = mockServer.getToolHandler('disconnect')!;
    const result = await handler({ serverId: 'test-server-1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.shellHistoryCleared).toBe(false);
  });

  it('returns shellHistoryCleared=true when shell was active', async () => {
    const { registerDisconnectTool } = await import('../../../src/tools/disconnect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const shell = new ShellSession();
    await shell.initialize(session.client);
    shellRegistry.set('test-server-1', shell);

    const mockServer = createMockServer();
    registerDisconnectTool(mockServer as never, pool, shellRegistry);

    const handler = mockServer.getToolHandler('disconnect')!;
    const result = await handler({ serverId: 'test-server-1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.shellHistoryCleared).toBe(true);
    expect(shellRegistry.has('test-server-1')).toBe(false);
  });

  it('cannot disconnect same server twice', async () => {
    const { registerDisconnectTool } = await import('../../../src/tools/disconnect.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    pool.add(session);

    const mockServer = createMockServer();
    registerDisconnectTool(mockServer as never, pool, shellRegistry);

    const handler = mockServer.getToolHandler('disconnect')!;

    const firstResult = await handler({ serverId: 'test-server-1' });
    expect(firstResult.isError).toBeUndefined();

    const secondResult = await handler({ serverId: 'test-server-1' });
    expect(secondResult.isError).toBe(true);
    expect(secondResult.content[0].text).toContain('No active connection');
  });
});
