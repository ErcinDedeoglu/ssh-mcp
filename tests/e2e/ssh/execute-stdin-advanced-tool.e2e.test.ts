import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  ConnectionPool,
  type TestContext,
  loadTestConfigFull,
  getShardConfigPath,
} from './ssh.setup.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E Execute Tool - Stdin Advanced', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let shellRegistry: ShellRegistry;
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
    shellRegistry = new ShellRegistry();
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

  it('executes bash script via stdin', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const script = `#!/bin/bash
sum=0
for i in 1 2 3 4 5; do
  sum=$((sum + i))
done
echo "Sum is $sum"`;

    const result = await handler({
      serverId: 'test-server-1',
      command: 'bash -s',
      stdin: script,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('Sum is 15');
    expect(parsed.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  });

  it('processes data and writes to file via stdin', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const logData = `INFO: Starting process
ERROR: Connection failed
INFO: Retrying
ERROR: Timeout occurred
INFO: Process completed`;
    const tmpFile = `/tmp/test-grep-${Date.now()}.log`;

    const writeResult = await handler({
      serverId: 'test-server-1',
      command: `cat > ${tmpFile}`,
      stdin: logData,
    });
    expect(writeResult.isError).toBeUndefined();

    const grepResult = await handler({
      serverId: 'test-server-1',
      command: `grep -c ERROR ${tmpFile}`,
    });
    expect(grepResult.isError).toBeUndefined();
    expect(JSON.parse(grepResult.content[0].text).stdout.trim()).toBe('2');

    pool.clear();
    shellRegistry.clear();
  });

  it('preserves special characters in stdin', async () => {
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('execute')!;
    const specialContent = `$HOME\n"quoted"\n'single'\n\`backtick\`\n\\backslash`;

    const result = await handler({
      serverId: 'test-server-1',
      command: 'cat',
      stdin: specialContent,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stdout).toContain('$HOME');
    expect(parsed.stdout).toContain('"quoted"');
    expect(parsed.stdout).toContain("'single'");
    expect(parsed.stdout).toContain('`backtick`');
    expect(parsed.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  });
});
