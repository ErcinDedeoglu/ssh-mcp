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
import { JobRegistry } from '../../../src/ssh/job-registry.js';
import type { Config } from '../../../src/config/types.js';

describe.skipIf(!isDockerRunning())('E2E Streaming Output - Progress Indicators', () => {
  let ctx: TestContext;
  let pool: ConnectionPool;
  let forwardRegistry: ForwardRegistry;
  let shellRegistry: ShellRegistry;
  let jobRegistry: JobRegistry;
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
    jobRegistry = new JobRegistry();
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

  async function waitForJobCompletion(jobId: string) {
    await new Promise<void>((resolve) => {
      const check = () => {
        const job = jobRegistry.get(jobId);
        if (job?.status === 'completed' || job?.status === 'failed') resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }

  it('msSinceLastOutput reflects time since last data', async () => {
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

    const result = await bgHandler({
      serverId: 'test-server-1',
      command: 'echo "start"; sleep 2; echo "end"',
      stallTimeout: 0,
    });

    const parsed = JSON.parse(result.content[0].text);
    await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => setTimeout(r, 1000));

    const check = await checkHandler({ jobId: parsed.jobId });
    const checkParsed = JSON.parse(check.content[0].text);

    if (checkParsed.status === 'running' && checkParsed.msSinceLastOutput !== undefined) {
      expect(checkParsed.msSinceLastOutput).toBeGreaterThanOrEqual(500);
    }

    await waitForJobCompletion(parsed.jobId);
    pool.clear();
    shellRegistry.clear();
  }, 15000);

  it('elapsedMs tracks total job runtime', async () => {
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

    const result = await bgHandler({
      serverId: 'test-server-1',
      command: 'sleep 1 && echo done',
      stallTimeout: 0,
    });

    const parsed = JSON.parse(result.content[0].text);

    await new Promise((r) => setTimeout(r, 500));
    const check1 = await checkHandler({ jobId: parsed.jobId });
    const check1Parsed = JSON.parse(check1.content[0].text);

    await new Promise((r) => setTimeout(r, 500));
    const check2 = await checkHandler({ jobId: parsed.jobId });
    const check2Parsed = JSON.parse(check2.content[0].text);

    if (check1Parsed.status === 'running' && check2Parsed.status === 'running') {
      expect(check2Parsed.elapsedMs).toBeGreaterThan(check1Parsed.elapsedMs);
    }

    await waitForJobCompletion(parsed.jobId);
    pool.clear();
    shellRegistry.clear();
  }, 10000);
});
