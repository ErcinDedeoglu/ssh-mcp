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
import { JobRegistry } from '../../../src/ssh/job-registry.js';
import { loadConfig } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/types.js';

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

describe.skipIf(!isDockerRunning())('E2E execute_background Tool', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let shellRegistry: ShellRegistry;
  let jobRegistry: JobRegistry;
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
    jobRegistry = new JobRegistry();
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

  it('starts job and returns job ID immediately', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteBackgroundTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      shellRegistry,
      jobRegistry,
    );

    const handler = mockServer.getToolHandler('execute_background')!;
    const startTime = Date.now();
    const result = await handler({
      serverId: 'test-server-1',
      command: 'sleep 3 && echo done',
    });
    const elapsed = Date.now() - startTime;

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.jobId).toMatch(/^job_/);
    expect(parsed.status).toBe('running');
    expect(elapsed).toBeLessThan(1000);

    pool.clear();
    shellRegistry.clear();
  });

  it('job completes with result after command finishes', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteBackgroundTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      shellRegistry,
      jobRegistry,
    );

    const handler = mockServer.getToolHandler('execute_background')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'echo "background output"',
    });

    const parsed = JSON.parse(result.content[0].text);
    const jobId = parsed.jobId;

    await new Promise<void>((resolve) => {
      const check = () => {
        const job = jobRegistry.get(jobId);
        if (job?.status === 'completed' || job?.status === 'failed') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    const job = jobRegistry.get(jobId);
    expect(job?.status).toBe('completed');
    expect(job?.result?.stdout).toContain('background output');
    expect(job?.result?.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  }, 10000);

  it('respects stallTimeout: 0 for long silent commands', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerExecuteBackgroundTool(
      mockServer as never,
      config,
      pool,
      forwardRegistry,
      shellRegistry,
      jobRegistry,
    );

    const handler = mockServer.getToolHandler('execute_background')!;
    const result = await handler({
      serverId: 'test-server-1',
      command: 'sleep 2 && echo "after long silence"',
      stallTimeout: 0,
    });

    const parsed = JSON.parse(result.content[0].text);
    const jobId = parsed.jobId;

    await new Promise<void>((resolve) => {
      const check = () => {
        const job = jobRegistry.get(jobId);
        if (job?.status === 'completed' || job?.status === 'failed') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    const job = jobRegistry.get(jobId);
    expect(job?.status).toBe('completed');
    expect(job?.result?.stdout).toContain('after long silence');

    pool.clear();
    shellRegistry.clear();
  }, 15000);
});
