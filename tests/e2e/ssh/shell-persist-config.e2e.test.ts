// E2E: Config persistence pipeline - detect shell → persist to config → verify file updated.
// Verifies the full round-trip: auto-detect on first connection writes to config file,
// subsequent connections use persisted type, explicit types are never overwritten.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  type TestContext,
  loadTestConfigFull,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import type { Config } from '../../../src/config/types.js';

function createTempConfig(config: Config): string {
  const tempDir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'ssh-mcp-persist-'));
  const configPath = path.join(tempDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  return configPath;
}

function readConfigShell(configPath: string, serverId: string): string | undefined {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const server = raw.servers?.find((s: { id: string }) => s.id === serverId);
  return server?.shell;
}

describe.skipIf(!isDockerRunning())('E2E Shell Config Persistence', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let shellRegistry: ShellRegistry;
  let originalConfigEnv: string | undefined;
  let tempConfigPath: string;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    ctx = createTestContext();
  });

  beforeEach(() => {
    pool = new ConnectionPool();
    forwardRegistry = new ForwardRegistry();
    shellRegistry = new ShellRegistry();
  });

  afterEach(() => {
    pool.clear();
    shellRegistry.clear();
    try {
      if (tempConfigPath) fs.rmSync(path.dirname(tempConfigPath), { recursive: true });
    } catch {
      /* */
    }
  });

  afterAll(() => {
    if (originalConfigEnv !== undefined) {
      process.env.SSH_MCP_CONFIG = originalConfigEnv;
    } else {
      delete process.env.SSH_MCP_CONFIG;
    }
    ctx.pool.clear();
  });

  it('persists detected shell type to config file on first execute', async () => {
    const config = loadTestConfigFull();
    // Ensure no shell field is set
    delete config.servers[0].shell;
    tempConfigPath = createTempConfig(config);
    process.env.SSH_MCP_CONFIG = tempConfigPath;

    // Verify config starts without shell
    expect(readConfigShell(tempConfigPath, 'test-server-1')).toBeUndefined();

    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    const handler = mockServer.getToolHandler('execute')!;

    const result = await handler({ serverId: 'test-server-1', command: 'echo persist-test' });
    expect(result.isError).toBeUndefined();

    // Config file should now have shell: "posix"
    expect(readConfigShell(tempConfigPath, 'test-server-1')).toBe('posix');
  });

  it('persists shell for "auto" config value', async () => {
    const config = loadTestConfigFull();
    config.servers[0].shell = 'auto';
    tempConfigPath = createTempConfig(config);
    process.env.SSH_MCP_CONFIG = tempConfigPath;

    expect(readConfigShell(tempConfigPath, 'test-server-1')).toBe('auto');

    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    const handler = mockServer.getToolHandler('execute')!;

    await handler({ serverId: 'test-server-1', command: 'echo test' });

    expect(readConfigShell(tempConfigPath, 'test-server-1')).toBe('posix');
  });

  it('does not overwrite explicit shell type in config', async () => {
    const config = loadTestConfigFull();
    config.servers[0].shell = 'posix';
    tempConfigPath = createTempConfig(config);
    process.env.SSH_MCP_CONFIG = tempConfigPath;

    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    const handler = mockServer.getToolHandler('execute')!;

    await handler({ serverId: 'test-server-1', command: 'echo test' });

    // Still 'posix' (not overwritten), but also not changed to something else
    expect(readConfigShell(tempConfigPath, 'test-server-1')).toBe('posix');
  });

  it('updates in-memory serverConfig.shell after detection', async () => {
    const config = loadTestConfigFull();
    delete config.servers[0].shell;
    tempConfigPath = createTempConfig(config);
    process.env.SSH_MCP_CONFIG = tempConfigPath;

    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    const handler = mockServer.getToolHandler('execute')!;

    // Before: shell is undefined
    expect(config.servers[0].shell).toBeUndefined();

    await handler({ serverId: 'test-server-1', command: 'echo first' });

    // After: in-memory config updated
    expect(config.servers[0].shell).toBe('posix');

    // Second command should still work (reuses shell, no re-detection)
    const result = await handler({ serverId: 'test-server-1', command: 'echo second' });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).stdout).toContain('second');
  });

  it('persists shell type for multiple different servers independently', async () => {
    const config = loadTestConfigFull();
    delete config.servers[0].shell;
    delete config.servers[1].shell;
    tempConfigPath = createTempConfig(config);
    process.env.SSH_MCP_CONFIG = tempConfigPath;

    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    const handler = mockServer.getToolHandler('execute')!;

    await handler({ serverId: 'test-server-1', command: 'echo s1' });
    await handler({ serverId: 'test-server-2', command: 'echo s2' });

    expect(readConfigShell(tempConfigPath, 'test-server-1')).toBe('posix');
    expect(readConfigShell(tempConfigPath, 'test-server-2')).toBe('posix');
  });

  it('preserves config file permissions (0600) after persist', async () => {
    const config = loadTestConfigFull();
    delete config.servers[0].shell;
    tempConfigPath = createTempConfig(config);
    process.env.SSH_MCP_CONFIG = tempConfigPath;

    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);
    const handler = mockServer.getToolHandler('execute')!;

    await handler({ serverId: 'test-server-1', command: 'echo perm-test' });

    const stats = fs.statSync(tempConfigPath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
