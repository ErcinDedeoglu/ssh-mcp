import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  executeCommand,
  type TestContext,
  loadTestConfigFull,
  getShardConfigPath,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E Auto-Connect - File Transfer', () => {
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

  describe('upload tool', () => {
    it('auto-connects for upload operation', async () => {
      const { registerUploadTool } = await import('../../../src/tools/upload.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const localFile = path.join(os.tmpdir(), 'auto-connect-upload-test.txt');
      const remoteFile = '/tmp/auto-connect-upload-test.txt';
      fs.writeFileSync(localFile, 'auto-connect upload test content');

      const mockServer = createMockServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerUploadTool(mockServer as any, config, pool, forwardRegistry);

      const handler = mockServer.getToolHandler('upload')!;
      expect(pool.get('test-server-1')).toBeUndefined();

      const result = await handler({
        serverId: 'test-server-1',
        localPath: localFile,
        remotePath: remoteFile,
      });

      expect(result.isError).toBeUndefined();
      expect(pool.get('test-server-1')).toBeDefined();

      fs.unlinkSync(localFile);
      pool.clear();
    });
  });

  describe('download tool', () => {
    it('auto-connects for download operation', async () => {
      const { registerDownloadTool } = await import('../../../src/tools/download.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');
      const { ensureConnected } = await import('../../../src/tools/ensure-connected.js');

      const connResult = await ensureConnected('test-server-1', {
        config,
        pool,
        forwardRegistry,
        remoteForwardRegistry,
      });
      if (!connResult.success) throw new Error('Failed to connect');

      await executeCommand(
        connResult.session.client,
        'echo "download test" > /tmp/auto-connect-download-test.txt',
      );
      pool.clear();

      const localFile = path.join(os.tmpdir(), 'auto-connect-download-test.txt');
      const remoteFile = '/tmp/auto-connect-download-test.txt';

      const mockServer = createMockServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerDownloadTool(mockServer as any, config, pool, forwardRegistry);

      const handler = mockServer.getToolHandler('download')!;
      expect(pool.get('test-server-1')).toBeUndefined();

      const result = await handler({
        serverId: 'test-server-1',
        remotePath: remoteFile,
        localPath: localFile,
      });

      expect(result.isError).toBeUndefined();
      expect(pool.get('test-server-1')).toBeDefined();

      const content = fs.readFileSync(localFile, 'utf-8');
      expect(content).toContain('download test');

      fs.unlinkSync(localFile);
      pool.clear();
    });
  });
});
