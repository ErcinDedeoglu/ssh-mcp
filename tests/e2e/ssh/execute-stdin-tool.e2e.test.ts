import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  type TestContext,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import { loadConfig } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/types.js';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

describe.skipIf(!isDockerRunning())('E2E Execute Tool - Stdin Basic', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let shellRegistry: ShellRegistry;
  let config: Config;
  let originalConfigEnv: string | undefined;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = TEST_CONFIG_PATH;
    ctx = createTestContext();
  });

  beforeEach(() => {
    pool = new ConnectionPool();
    forwardRegistry = new ForwardRegistry();
    shellRegistry = new ShellRegistry();
    config = loadConfig();
  });

  afterAll(() => {
    if (originalConfigEnv !== undefined) {
      process.env.SSH_MCP_CONFIG = originalConfigEnv;
    } else {
      delete process.env.SSH_MCP_CONFIG;
    }
    ctx.pool.clear();
  });

  it('echoes stdin content back via cat', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'cat',
      stdin: 'hello world',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('hello world');
    expect(parsed.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  });

  it('creates file with multi-line content via cat', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const configContent = `# Test config\nkey1=value1\nkey2=value2\nkey3=value3`;
    const tmpFile = `/tmp/test-stdin-${Date.now()}.conf`;

    const writeResult = await handler({
      serverId: 'test-server-1',
      command: `cat > ${tmpFile}`,
      stdin: configContent,
    });

    expect(writeResult.isError).toBeUndefined();
    expect(JSON.parse(writeResult.content[0].text).exitCode).toBe(0);

    const readResult = await handler({
      serverId: 'test-server-1',
      command: `cat ${tmpFile}`,
    });

    expect(readResult.isError).toBeUndefined();
    const readParsed = JSON.parse(readResult.content[0].text);
    expect(readParsed.stdout).toContain('key1=value1');
    expect(readParsed.stdout).toContain('key2=value2');
    expect(readParsed.stdout).toContain('key3=value3');

    pool.clear();
    shellRegistry.clear();
  });

  it('handles empty stdin content', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'wc -l',
      stdin: '',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout.trim()).toBe('1');
    expect(parsed.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  });
});
