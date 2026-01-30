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

describe.skipIf(!isDockerRunning())('E2E cancel_job Tool', () => {
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

  it('cancels running job and sends SIGINT', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { registerCancelJobTool } = await import('../../../src/tools/cancel-job.js');
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
    registerCancelJobTool(mockServer as never, jobRegistry, shellRegistry);

    const bgHandler = mockServer.getToolHandler('execute_background')!;
    const cancelHandler = mockServer.getToolHandler('cancel_job')!;

    const bgResult = await bgHandler({
      serverId: 'test-server-1',
      command: 'sleep 30',
      stallTimeout: 0,
    });
    const { jobId } = JSON.parse(bgResult.content[0].text);

    await new Promise((r) => setTimeout(r, 500));

    const cancelResult = await cancelHandler({ jobId });
    const cancelParsed = JSON.parse(cancelResult.content[0].text);

    expect(cancelParsed.status).toBe('cancelled');
    expect(cancelParsed.interruptSent).toBe(true);

    const job = jobRegistry.get(jobId);
    expect(job?.status).toBe('cancelled');

    pool.clear();
    shellRegistry.clear();
  }, 10000);

  it('returns already_completed for finished job', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { registerCancelJobTool } = await import('../../../src/tools/cancel-job.js');
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
    registerCancelJobTool(mockServer as never, jobRegistry, shellRegistry);

    const bgHandler = mockServer.getToolHandler('execute_background')!;
    const cancelHandler = mockServer.getToolHandler('cancel_job')!;

    const bgResult = await bgHandler({
      serverId: 'test-server-1',
      command: 'echo quick',
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

    const cancelResult = await cancelHandler({ jobId });
    const cancelParsed = JSON.parse(cancelResult.content[0].text);

    expect(cancelParsed.status).toBe('completed');
    expect(cancelParsed.message).toBe('Job already completed');

    pool.clear();
    shellRegistry.clear();
  }, 10000);

  it('shell session recovers after cancel and accepts new commands', async () => {
    const { registerExecuteBackgroundTool } =
      await import('../../../src/tools/execute-background.js');
    const { registerCancelJobTool } = await import('../../../src/tools/cancel-job.js');
    const { registerExecuteTool } = await import('../../../src/tools/execute.js');
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
    registerCancelJobTool(mockServer as never, jobRegistry, shellRegistry);
    registerExecuteTool(mockServer as never, config, pool, forwardRegistry, shellRegistry);

    const bgHandler = mockServer.getToolHandler('execute_background')!;
    const cancelHandler = mockServer.getToolHandler('cancel_job')!;
    const execHandler = mockServer.getToolHandler('execute')!;

    const bgResult = await bgHandler({
      serverId: 'test-server-1',
      command: 'sleep 30',
      stallTimeout: 0,
    });
    const { jobId } = JSON.parse(bgResult.content[0].text);

    await new Promise((r) => setTimeout(r, 500));
    await cancelHandler({ jobId });

    await new Promise((r) => setTimeout(r, 500));

    const execResult = await execHandler({
      serverId: 'test-server-1',
      command: 'echo "recovered after cancel"',
    });

    expect(execResult.isError).toBeUndefined();
    const execParsed = JSON.parse(execResult.content[0].text);
    expect(execParsed.stdout).toContain('recovered after cancel');

    pool.clear();
    shellRegistry.clear();
  }, 15000);
});
