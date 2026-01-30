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

describe('cancel_job tool edge cases', () => {
  let jobRegistry: JobRegistry;
  let shellRegistry: ShellRegistry;

  beforeEach(() => {
    jobRegistry = new JobRegistry();
    shellRegistry = new ShellRegistry();
    mockCancelCurrentCommand.mockClear();
    mockCancelCurrentCommand.mockReturnValue(true);
    mockHasRunningCommand.mockReturnValue(true);
  });

  it('cancels pending job (not yet running)', async () => {
    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'sleep 100');

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('cancelled');

    const updatedJob = jobRegistry.get(job.id);
    expect(updatedJob?.status).toBe('cancelled');
  });

  it('returns already cancelled for cancelled jobs', async () => {
    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'sleep 100');
    jobRegistry.updateStatus(job.id, 'cancelled');

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('cancelled');
    expect(parsed.message).toBe('Job already cancelled');
  });

  it('does not send interrupt when shell has no running command', async () => {
    mockHasRunningCommand.mockReturnValue(false);

    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const mockShell = new (ShellSession as unknown as new () => { hasRunningCommand: boolean })();
    shellRegistry.set('server1', mockShell as never);

    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'sleep 100');
    jobRegistry.updateStatus(job.id, 'running');

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    expect(mockCancelCurrentCommand).not.toHaveBeenCalled();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.interruptSent).toBe(false);
  });

  it('handles cancelCurrentCommand returning false', async () => {
    mockCancelCurrentCommand.mockReturnValue(false);

    const { ShellSession } = await import('../../../src/ssh/shell-session.js');
    const mockShell = new (ShellSession as unknown as new () => { hasRunningCommand: boolean })();
    shellRegistry.set('server1', mockShell as never);

    const mockServer = createMockServer();
    registerCancelJobTool(mockServer as unknown as McpServer, jobRegistry, shellRegistry);

    const job = jobRegistry.create('server1', 'sleep 100');
    jobRegistry.updateStatus(job.id, 'running');

    const handler = mockServer.getToolHandler('cancel_job')!;
    const result = await handler({ jobId: job.id });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.interruptSent).toBe(false);
    expect(parsed.status).toBe('cancelled');
  });
});
