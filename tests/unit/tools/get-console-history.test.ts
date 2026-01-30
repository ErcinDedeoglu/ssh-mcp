import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMockServer } from './_fixtures/mock-server.js';

describe('get_console_history', () => {
  let mockShellRegistry: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    has: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    size: number;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockShellRegistry = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      size: 0,
    };
  });

  it('returns error when no shell session exists', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');

    mockShellRegistry.get.mockReturnValue(undefined);

    const mockServer = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerGetConsoleHistoryTool(mockServer as unknown as McpServer, mockShellRegistry as any);

    const handler = mockServer.getToolHandler('get_console_history')!;
    const result = await handler({ serverId: 'test-server' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No shell session');
    expect(result.content[0].text).toContain('test-server');
  });

  it('returns history from shell session', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');

    const mockHistory = [
      { command: 'ls', stdout: 'file1\nfile2', exitCode: 0, timestamp: Date.now(), durationMs: 10 },
      { command: 'pwd', stdout: '/home/user', exitCode: 0, timestamp: Date.now(), durationMs: 5 },
    ];
    const mockShell = { getHistory: vi.fn().mockReturnValue(mockHistory) };
    mockShellRegistry.get.mockReturnValue(mockShell);

    const mockServer = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerGetConsoleHistoryTool(mockServer as unknown as McpServer, mockShellRegistry as any);

    const handler = mockServer.getToolHandler('get_console_history')!;
    const result = await handler({ serverId: 'test-server' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.serverId).toBe('test-server');
    expect(parsed.count).toBe(2);
    expect(parsed.history).toEqual(mockHistory);
  });

  it('passes limit parameter to getHistory', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');

    const mockShell = { getHistory: vi.fn().mockReturnValue([]) };
    mockShellRegistry.get.mockReturnValue(mockShell);

    const mockServer = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerGetConsoleHistoryTool(mockServer as unknown as McpServer, mockShellRegistry as any);

    const handler = mockServer.getToolHandler('get_console_history')!;
    await handler({ serverId: 'test-server', limit: 5 });

    expect(mockShell.getHistory).toHaveBeenCalledWith(5);
  });

  it('returns empty history when shell has no commands', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');

    const mockShell = { getHistory: vi.fn().mockReturnValue([]) };
    mockShellRegistry.get.mockReturnValue(mockShell);

    const mockServer = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerGetConsoleHistoryTool(mockServer as unknown as McpServer, mockShellRegistry as any);

    const handler = mockServer.getToolHandler('get_console_history')!;
    const result = await handler({ serverId: 'test-server' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.history).toEqual([]);
  });

  it('handles getHistory throwing an error', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');

    const mockShell = {
      getHistory: vi.fn().mockImplementation(() => {
        throw new Error('Shell destroyed');
      }),
    };
    mockShellRegistry.get.mockReturnValue(mockShell);

    const mockServer = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerGetConsoleHistoryTool(mockServer as unknown as McpServer, mockShellRegistry as any);

    const handler = mockServer.getToolHandler('get_console_history')!;
    const result = await handler({ serverId: 'test-server' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Shell destroyed');
  });

  it('calls getHistory without limit when not specified', async () => {
    const { registerGetConsoleHistoryTool } =
      await import('../../../src/tools/get-console-history.js');

    const mockShell = { getHistory: vi.fn().mockReturnValue([]) };
    mockShellRegistry.get.mockReturnValue(mockShell);

    const mockServer = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerGetConsoleHistoryTool(mockServer as unknown as McpServer, mockShellRegistry as any);

    const handler = mockServer.getToolHandler('get_console_history')!;
    await handler({ serverId: 'test-server' });

    expect(mockShell.getHistory).toHaveBeenCalledWith(undefined);
  });
});
