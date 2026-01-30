import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  type TestContext,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { loadConfig } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/types.js';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

describe.skipIf(!isDockerRunning())('E2E upload Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let config: Config;
  let originalConfigEnv: string | undefined;
  let tempDir: string;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = TEST_CONFIG_PATH;
    ctx = createTestContext();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-upload-test-'));
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

  it('uploads file successfully', async () => {
    const { registerUploadTool } = await import('../../../src/tools/upload.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const localPath = path.join(tempDir, 'test-upload.txt');
    fs.writeFileSync(localPath, 'upload content');

    const mockServer = createMockServer();
    registerUploadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('upload')!;
    const result = await handler({
      serverId: 'test-server-1',
      localPath,
      remotePath: '/tmp/uploaded-test.txt',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('uploaded');
    expect(parsed.remotePath).toBe('/tmp/uploaded-test.txt');

    pool.clear();
  });

  it('returns error for non-existent local file', async () => {
    const { registerUploadTool } = await import('../../../src/tools/upload.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerUploadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('upload')!;
    const result = await handler({
      serverId: 'test-server-1',
      localPath: '/nonexistent/path/file.txt',
      remotePath: '/tmp/dest.txt',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toMatch(/no such file|enoent|not found/i);

    pool.clear();
  });

  it('returns error for invalid serverId', async () => {
    const { registerUploadTool } = await import('../../../src/tools/upload.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const localPath = path.join(tempDir, 'test-upload2.txt');
    fs.writeFileSync(localPath, 'content');

    const mockServer = createMockServer();
    registerUploadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('upload')!;
    const result = await handler({
      serverId: 'nonexistent-server',
      localPath,
      remotePath: '/tmp/dest.txt',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nonexistent-server');

    pool.clear();
  });

  it('auto-connects for upload operation', async () => {
    const { registerUploadTool } = await import('../../../src/tools/upload.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const localPath = path.join(tempDir, 'auto-connect-upload.txt');
    fs.writeFileSync(localPath, 'auto connect test');

    expect(pool.has('test-server-1')).toBe(false);

    const mockServer = createMockServer();
    registerUploadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('upload')!;
    const result = await handler({
      serverId: 'test-server-1',
      localPath,
      remotePath: '/tmp/auto-connect-upload.txt',
    });

    expect(result.isError).toBeUndefined();
    expect(pool.has('test-server-1')).toBe(true);

    pool.clear();
  });

  it('uploads file with unique name to avoid conflicts', async () => {
    const { registerUploadTool } = await import('../../../src/tools/upload.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const uniqueId = Date.now();
    const localPath = path.join(tempDir, `unique-test-${uniqueId}.txt`);
    fs.writeFileSync(localPath, 'unique file test');

    const mockServer = createMockServer();
    registerUploadTool(mockServer as never, config, pool, forwardRegistry);

    const handler = mockServer.getToolHandler('upload')!;
    const result = await handler({
      serverId: 'test-server-1',
      localPath,
      remotePath: `/tmp/unique-upload-${uniqueId}.txt`,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('uploaded');
    expect(parsed.remotePath).toBe(`/tmp/unique-upload-${uniqueId}.txt`);

    pool.clear();
  });
});
