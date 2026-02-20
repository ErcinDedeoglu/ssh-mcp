// E2E: SFTP tilde (~) expansion via sftp.realpath against real SSH servers.
// Tests both FileTransfer class-level and MCP tool-level (upload/download handlers).
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  SessionKeeper,
  FileTransfer,
  executeCommand,
  type TestContext,
  loadTestConfigFull,
  getShardConfigPath,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import type { Config, ServerConfig } from '../../../src/config/types.js';

async function getHomeDir(sc: ServerConfig): Promise<{ session: SessionKeeper; homeDir: string }> {
  const session = new SessionKeeper(sc, { maxReconnectAttempts: 0 });
  await session.connect();
  const homeDir = (await executeCommand(session.client, 'echo $HOME')).stdout.trim();
  return { session, homeDir };
}

describe.skipIf(!isDockerRunning())('E2E SFTP Tilde Expansion', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let config: Config;
  let originalConfigEnv: string | undefined;
  let tempDir: string;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = getShardConfigPath();
    ctx = createTestContext();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-sftp-tilde-'));
  });

  beforeEach(() => {
    pool = new ConnectionPool();
    forwardRegistry = new ForwardRegistry();
    config = loadTestConfigFull();
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

  describe('FileTransfer class level', () => {
    it('uploads to ~/path using realpath-resolved home dir', async () => {
      const { session, homeDir } = await getHomeDir(ctx.server1Config);
      const f = `tilde-upload-${Date.now()}.txt`;
      const local = path.join(tempDir, f);
      fs.writeFileSync(local, 'tilde upload content');

      const ft = new FileTransfer(session);
      await ft.upload(local, `~/${f}`);

      const result = await executeCommand(session.client, `cat ${homeDir}/${f}`);
      expect(result.stdout).toBe('tilde upload content');
      await executeCommand(session.client, `rm ${homeDir}/${f}`);
      session.disconnect();
    });

    it('downloads from ~/path using realpath-resolved home dir', async () => {
      const { session, homeDir } = await getHomeDir(ctx.server1Config);
      const f = `tilde-download-${Date.now()}.txt`;
      await executeCommand(session.client, `echo -n 'tilde download' > ${homeDir}/${f}`);

      const ft = new FileTransfer(session);
      const local = path.join(tempDir, f);
      await ft.download(`~/${f}`, local);

      expect(fs.readFileSync(local, 'utf-8')).toBe('tilde download');
      await executeCommand(session.client, `rm ${homeDir}/${f}`);
      session.disconnect();
    });

    it('works on key-auth server too', async () => {
      const { session, homeDir } = await getHomeDir(ctx.serverKeyConfig);
      const f = `key-tilde-${Date.now()}.txt`;
      const local = path.join(tempDir, f);
      fs.writeFileSync(local, 'key auth tilde');

      const ft = new FileTransfer(session);
      await ft.upload(local, `~/${f}`);

      const result = await executeCommand(session.client, `cat ${homeDir}/${f}`);
      expect(result.stdout).toBe('key auth tilde');
      await executeCommand(session.client, `rm ${homeDir}/${f}`);
      session.disconnect();
    });
  });

  describe('upload/download tool level', () => {
    it('upload tool resolves ~ in remotePath', async () => {
      const { registerUploadTool } = await import('../../../src/tools/upload.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      const f = `tool-upload-tilde-${Date.now()}.txt`;
      const local = path.join(tempDir, f);
      fs.writeFileSync(local, 'tool upload tilde');

      const mockServer = createMockServer();
      registerUploadTool(mockServer as never, config, pool, forwardRegistry);
      const handler = mockServer.getToolHandler('upload')!;

      const result = await handler({
        serverId: 'test-server-1',
        localPath: local,
        remotePath: `~/${f}`,
      });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text).status).toBe('uploaded');

      // Verify via direct SSH
      const { session, homeDir } = await getHomeDir(ctx.server1Config);
      const cat = await executeCommand(session.client, `cat ${homeDir}/${f}`);
      expect(cat.stdout).toBe('tool upload tilde');
      await executeCommand(session.client, `rm ${homeDir}/${f}`);
      session.disconnect();
      pool.clear();
    });

    it('download tool resolves ~ in remotePath', async () => {
      const { registerDownloadTool } = await import('../../../src/tools/download.js');
      const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

      // Create file on remote first
      const { session: s1, homeDir } = await getHomeDir(ctx.server1Config);
      const f = `tool-download-tilde-${Date.now()}.txt`;
      await executeCommand(s1.client, `echo -n 'tool download tilde' > ${homeDir}/${f}`);
      s1.disconnect();

      const mockServer = createMockServer();
      registerDownloadTool(mockServer as never, config, pool, forwardRegistry);
      const handler = mockServer.getToolHandler('download')!;

      const local = path.join(tempDir, f);
      const result = await handler({
        serverId: 'test-server-1',
        remotePath: `~/${f}`,
        localPath: local,
      });
      expect(result.isError).toBeUndefined();
      expect(fs.readFileSync(local, 'utf-8')).toBe('tool download tilde');

      // Cleanup
      const { session: s2 } = await getHomeDir(ctx.server1Config);
      await executeCommand(s2.client, `rm ${homeDir}/${f}`);
      s2.disconnect();
      pool.clear();
    });
  });
});
