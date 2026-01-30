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

describe.skipIf(!isDockerRunning())('E2E check_job Tool', () => {
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

  it('returns running status for active job', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { registerCheckJobTool } = await import('../../../src/tools/check-job.js');
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
    registerCheckJobTool(mockServer as never, jobRegistry);

    const bgHandler = mockServer.getToolHandler('execute_background')!;
    const checkHandler = mockServer.getToolHandler('check_job')!;

    const bgResult = await bgHandler({
      serverId: 'test-server-1',
      command: 'sleep 5 && echo done',
      stallTimeout: 0,
    });
    const { jobId } = JSON.parse(bgResult.content[0].text);

    const checkResult = await checkHandler({ jobId });
    const checkParsed = JSON.parse(checkResult.content[0].text);

    expect(checkParsed.status).toBe('running');
    expect(checkParsed.serverId).toBe('test-server-1');

    pool.clear();
    shellRegistry.clear();
  });

  it('returns completed status with result after job finishes', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { registerCheckJobTool } = await import('../../../src/tools/check-job.js');
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
    registerCheckJobTool(mockServer as never, jobRegistry);

    const bgHandler = mockServer.getToolHandler('execute_background')!;
    const checkHandler = mockServer.getToolHandler('check_job')!;

    const bgResult = await bgHandler({
      serverId: 'test-server-1',
      command: 'echo "check me"',
    });
    const { jobId } = JSON.parse(bgResult.content[0].text);

    await new Promise<void>((resolve) => {
      const poll = () => {
        const job = jobRegistry.get(jobId);
        if (job?.status === 'completed') resolve();
        else setTimeout(poll, 100);
      };
      poll();
    });

    const checkResult = await checkHandler({ jobId });
    const checkParsed = JSON.parse(checkResult.content[0].text);

    expect(checkParsed.status).toBe('completed');
    expect(checkParsed.result.stdout).toContain('check me');
    expect(checkParsed.result.exitCode).toBe(0);

    pool.clear();
    shellRegistry.clear();
  }, 10000);

  it('returns job_not_found for unknown job ID', async () => {
    const { registerCheckJobTool } = await import('../../../src/tools/check-job.js');
    const { createMockServer } = await import('../../unit/tools/_fixtures/mock-server.js');

    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as never, jobRegistry);

    const checkHandler = mockServer.getToolHandler('check_job')!;
    const checkResult = await checkHandler({ jobId: 'job_nonexistent' });

    expect(checkResult.isError).toBe(true);
    const checkParsed = JSON.parse(checkResult.content[0].text);
    expect(checkParsed.error).toBe('job_not_found');
  });
});
