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

describe.skipIf(!isDockerRunning())('E2E Streaming Output - Partial Output', () => {
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

  it('check_job returns partial output while job is running', async () => {
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
      command: 'echo "line1"; sleep 1; echo "line2"; sleep 1; echo "line3"',
      stallTimeout: 0,
    });

    const parsed = JSON.parse(result.content[0].text);
    await new Promise((r) => setTimeout(r, 500));

    const midCheck = await checkHandler({ jobId: parsed.jobId });
    const midParsed = JSON.parse(midCheck.content[0].text);

    expect(midParsed.status).toBe('running');
    expect(midParsed.partialOutput).toContain('line1');
    expect(midParsed.bytesReceived).toBeGreaterThan(0);

    await waitForJobCompletion(parsed.jobId);
    pool.clear();
    shellRegistry.clear();
  }, 15000);

  it('bytesReceived increases as output arrives', async () => {
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
      command: 'for i in 1 2 3 4 5; do echo "iteration $i"; sleep 0.3; done',
      stallTimeout: 0,
    });

    const parsed = JSON.parse(result.content[0].text);
    const bytesCounts: number[] = [];

    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const check = await checkHandler({ jobId: parsed.jobId });
      const checkParsed = JSON.parse(check.content[0].text);
      if (checkParsed.status === 'running') bytesCounts.push(checkParsed.bytesReceived);
    }

    const increasing = bytesCounts.every((val, idx) => idx === 0 || val >= bytesCounts[idx - 1]);
    expect(increasing).toBe(true);
    expect(bytesCounts.length).toBeGreaterThan(0);

    await waitForJobCompletion(parsed.jobId);
    pool.clear();
    shellRegistry.clear();
  }, 15000);
});
