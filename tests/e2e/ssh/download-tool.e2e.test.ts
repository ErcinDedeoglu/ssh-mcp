import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  SessionKeeper,
  executeCommand,
  type TestContext,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { loadConfig } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/types.js';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

describe.skipIf(!isDockerRunning())('E2E download Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let config: Config;
  let originalConfigEnv: string | undefined;
  let tempDir: string;

  beforeAll(async () => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = TEST_CONFIG_PATH;
    ctx = createTestContext();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-download-test-'));

    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    await executeCommand(session.client, 'echo "download test content" > /tmp/download-test.txt');
    session.disconnect();
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
    fs.rmSync(tempDir, { recursive: true, force: true });
    ctx.pool.clear();
  });

  it('downloads file successfully', async () => {
    const { registerDownloadTool } = await import('../../../src/tools/download.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const localPath = path.join(tempDir, 'downloaded.txt');

    const mockServer = createMockServer();
    registerDownloadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('download')!;
    const result = await handler({
      serverId: 'test-server-1',
      remotePath: '/tmp/download-test.txt',
      localPath,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('downloaded');

    const content = fs.readFileSync(localPath, 'utf-8');
    expect(content.trim()).toBe('download test content');

    pool.clear();
  });

  it('returns error for non-existent remote file', async () => {
    const { registerDownloadTool } = await import('../../../src/tools/download.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const localPath = path.join(tempDir, 'nonexistent.txt');

    const mockServer = createMockServer();
    registerDownloadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('download')!;
    const result = await handler({
      serverId: 'test-server-1',
      remotePath: '/nonexistent/path/file.txt',
      localPath,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toMatch(/no such file|not found/i);

    pool.clear();
  });

  it('returns error for invalid serverId', async () => {
    const { registerDownloadTool } = await import('../../../src/tools/download.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerDownloadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('download')!;
    const result = await handler({
      serverId: 'nonexistent-server',
      remotePath: '/tmp/download-test.txt',
      localPath: path.join(tempDir, 'invalid.txt'),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nonexistent-server');

    pool.clear();
  });

  it('auto-connects for download operation', async () => {
    const { registerDownloadTool } = await import('../../../src/tools/download.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    expect(pool.has('test-server-1')).toBe(false);

    const localPath = path.join(tempDir, 'auto-connect-download.txt');

    const mockServer = createMockServer();
    registerDownloadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('download')!;
    const result = await handler({
      serverId: 'test-server-1',
      remotePath: '/tmp/download-test.txt',
      localPath,
    });

    expect(result.isError).toBeUndefined();
    expect(pool.has('test-server-1')).toBe(true);

    pool.clear();
  });

  it('returns error when local directory does not exist', async () => {
    const { registerDownloadTool } = await import('../../../src/tools/download.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const nestedPath = path.join(tempDir, 'nonexistent-nested', 'dir', 'downloaded.txt');

    const mockServer = createMockServer();
    registerDownloadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('download')!;
    const result = await handler({
      serverId: 'test-server-1',
      remotePath: '/tmp/download-test.txt',
      localPath: nestedPath,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toMatch(/no such file|enoent|directory/i);

    pool.clear();
  });
});
