import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMockServer } from './_fixtures/mock-server.js';
import { JobRegistry } from '../../../src/ssh/job-registry.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';
import { registerCancelJobTool } from '../../../src/tools/cancel-job.js';

const mockCancelCurrentCommand = vi.fn();
const mockHasRunningCommand = vi.fn();

vi.mock('../../../src/ssh/shell-session.js', () => ({
  ShellSession: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    cancelCurrentCommand: mockCancelCurrentCommand,
    get hasRunningCommand() {
      return mockHasRunningCommand();
    },
  })),
}));

describe('cancel_job tool', () => {
  let jobRegistry: JobRegistry;
  let shellRegistry: ShellRegistry;

  beforeEach(() => {
    jobRegistry = new JobRegistry();
    shellRegistry = new ShellRegistry();
    mockCancelCurrentCommand.mockClear();
    mockCancelCurrentCommand.mockReturnValue(true);
    mockHasRunningCommand.mockReturnValue(true);
  });

  it('returns job_not_found for unknown job ID', async () => {
    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: 'nonexistent' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('job_not_found');
  });

  it('returns already completed for completed jobs', async () => {
    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'echo hello');
    jobRegistry.setResult(job.id, { stdout: 'hello', stderr: '', exitCode: 0 });

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('completed');
    expect(parsed.message).toBe('Job already completed');
  });

  it('returns already failed for failed jobs', async () => {
    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'bad command');
    jobRegistry.setError(job.id, 'Connection lost');

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('failed');
    expect(parsed.message).toBe('Job already failed');
  });

  it('cancels running job and marks as cancelled', async () => {
    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'sleep 100');
    jobRegistry.updateStatus(job.id, 'running');

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('cancelled');

    const updatedJob = jobRegistry.get(job.id);
    expect(updatedJob?.status).toBe('cancelled');
    expect(updatedJob?.error).toBe('Job cancelled by user');
  });

  it('sends interrupt when shell has running command', async () => {
    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const mockShell = new (ShellSession as unknown as new () => { hasRunningCommand: boolean })();

    shellRegistry.set('server1', mockShell as never);

    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'sleep 100');
    jobRegistry.updateStatus(job.id, 'running');

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    expect(mockCancelCurrentCommand).toHaveBeenCalled();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.interruptSent).toBe(true);
    expect(parsed.message).toContain('SIGINT');
  });

  it('does not send interrupt when no shell session', async () => {
    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'sleep 100');
    jobRegistry.updateStatus(job.id, 'running');

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.interruptSent).toBe(false);
  });
});
