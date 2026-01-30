import { describe, it, expect, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { JobRegistry } from '../../../src/ssh/job-registry.js';
import { registerCheckJobTool } from '../../../src/tools/check-job.js';

describe('check_job tool', () => {
  let jobRegistry: JobRegistry;

  beforeEach(() => {
    jobRegistry = new JobRegistry();
  });

  it('returns job_not_found for unknown job ID', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: 'nonexistent' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('job_not_found');
    expect(parsed.message).toContain('nonexistent');
  });

  it('returns pending job status', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const job = jobRegistry.create('server1', 'echo hello');
    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.jobId).toBe(job.id);
    expect(parsed.serverId).toBe('server1');
    expect(parsed.command).toBe('echo hello');
    expect(parsed.status).toBe('pending');
    expect(parsed.startedAt).toBeDefined();
  });

  it('returns running job status', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const job = jobRegistry.create('server1', 'echo hello');
    jobRegistry.updateStatus(job.id, 'running');

    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('running');
  });

  it('returns completed job with result', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const job = jobRegistry.create('server1', 'echo hello');
    jobRegistry.setResult(job.id, { stdout: 'hello', stderr: '', exitCode: 0 });

    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('completed');
    expect(parsed.result).toEqual({ stdout: 'hello', stderr: '', exitCode: 0 });
    expect(parsed.completedAt).toBeDefined();
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns failed job with error', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const job = jobRegistry.create('server1', 'bad command');
    jobRegistry.setError(job.id, 'Connection lost');

    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('failed');
    expect(parsed.error).toBe('Connection lost');
    expect(parsed.completedAt).toBeDefined();
  });

  it('includes partial output if available', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const job = jobRegistry.create('server1', 'echo hello');
    jobRegistry.updateStatus(job.id, 'running');
    jobRegistry.appendOutput(job.id, 'partial output');

    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.partialOutput).toBe('partial output');
  });

  it('returns cancelled job status with error', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const job = jobRegistry.create('server1', 'sleep 100');
    const jobToUpdate = jobRegistry.get(job.id)!;
    jobToUpdate.status = 'cancelled';
    jobToUpdate.error = 'Job cancelled by user';
    jobToUpdate.completedAt = Date.now();

    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('cancelled');
    expect(parsed.error).toBe('Job cancelled by user');
    expect(parsed.completedAt).toBeDefined();
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not include result field for non-completed jobs', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const job = jobRegistry.create('server1', 'echo hello');
    jobRegistry.updateStatus(job.id, 'running');

    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.result).toBeUndefined();
  });

  it('does not include error field when no error', async () => {
    const mockServer = createMockServer();
    registerCheckJobTool(mockServer as unknown as McpServer, jobRegistry);

    const job = jobRegistry.create('server1', 'echo hello');
    jobRegistry.setResult(job.id, { stdout: 'hello', stderr: '', exitCode: 0 });

    const handler = mockServer.getToolHandler('check_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeUndefined();
  });
});
