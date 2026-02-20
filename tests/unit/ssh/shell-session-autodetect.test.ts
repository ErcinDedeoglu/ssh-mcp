import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockWrite = vi.fn();
const mockEnd = vi.fn();

class MockShellStream extends EventEmitter {
  write = mockWrite;
  end = mockEnd;
  stderr = new EventEmitter();
}

let mockStream: MockShellStream;
let mockWaitForInitialPrompt: ReturnType<typeof vi.fn>;

// We need per-test control over the prompt returned by waitForInitialPrompt
mockWaitForInitialPrompt = vi.fn().mockResolvedValue('user@host:~$ ');

vi.mock('../../../src/ssh/shell-session.io.js', () => ({
  createShellStream: vi.fn(() => {
    mockStream = new MockShellStream();
    return Promise.resolve(mockStream);
  }),
  waitForInitialPrompt: (...args: unknown[]) => mockWaitForInitialPrompt(...args),
  waitForMcpPrompt: vi.fn().mockResolvedValue('__MCP_PROMPT__'),
}));

describe('ShellSession auto-detection', () => {
  const mockClient = { shell: vi.fn() } as never;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockEnd.mockClear();
    mockWaitForInitialPrompt.mockReset().mockResolvedValue('user@host:~$ ');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('shellType getter lifecycle', () => {
    it('returns "auto" before initialize when no explicit shellType', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      const session = new ShellSession({});
      expect(session.shellType).toBe('auto');
    });

    it('returns concrete type immediately when explicit shellType given', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      const session = new ShellSession({ shellType: 'powershell' });
      expect(session.shellType).toBe('powershell');
    });

    it('resolves to "posix" after init with bash prompt', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('user@host:~$ ');
      const session = new ShellSession({});
      await session.initialize(mockClient);
      expect(session.shellType).toBe('posix');
    });

    it('resolves to "powershell" after init with PS prompt', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('PS C:\\Users\\admin>');
      const session = new ShellSession({});
      await session.initialize(mockClient);
      expect(session.shellType).toBe('powershell');
    });

    it('resolves to "cmd" after init with cmd prompt', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('C:\\Users\\admin>');
      const session = new ShellSession({});
      await session.initialize(mockClient);
      expect(session.shellType).toBe('cmd');
    });
  });

  describe('adapter wiring after auto-detection', () => {
    it('sends posix init commands for detected posix shell', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('root@server:/# ');
      const session = new ShellSession({ stallTimeoutMs: null });
      await session.initialize(mockClient);
      mockWrite.mockClear();

      // The init commands should have been posix-style (PS1=, stty, etc.)
      // Verify by checking that wrapped execute commands use posix syntax
      void session.execute('whoami');
      const wrappedCmd = mockWrite.mock.calls[0][0] as string;
      expect(wrappedCmd).toContain('__MCP_EXIT=$?');
      expect(wrappedCmd).toContain('echo $__MCP_EXIT');
    });

    it('sends powershell init commands for detected PS prompt', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('PS C:\\Windows\\system32>');
      const session = new ShellSession({ stallTimeoutMs: null });
      await session.initialize(mockClient);
      mockWrite.mockClear();

      void session.execute('Get-Process');
      const wrappedCmd = mockWrite.mock.calls[0][0] as string;
      expect(wrappedCmd).toContain('$LASTEXITCODE');
      expect(wrappedCmd).toContain('Write-Host');
    });

    it('sends cmd init commands for detected cmd prompt', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('C:\\Users\\admin>');
      const session = new ShellSession({ stallTimeoutMs: null });
      await session.initialize(mockClient);
      mockWrite.mockClear();

      void session.execute('dir');
      const wrappedCmd = mockWrite.mock.calls[0][0] as string;
      expect(wrappedCmd).toContain('@call dir');
      expect(wrappedCmd).toContain('echo %ERRORLEVEL%');
    });

    it('uses correct EOF char for detected powershell', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('PS /home/user>');
      const session = new ShellSession({ stallTimeoutMs: null });
      await session.initialize(mockClient);
      mockWrite.mockClear();

      void session.execute('cat', { stdin: 'data' });
      await vi.advanceTimersByTimeAsync(100);
      // stdin write, then EOF char
      const eofWrite = mockWrite.mock.calls[2]?.[0] as string;
      expect(eofWrite).toBe('\x1A'); // Windows EOF
    });

    it('uses correct EOF char for detected posix', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('$ ');
      const session = new ShellSession({ stallTimeoutMs: null });
      await session.initialize(mockClient);
      mockWrite.mockClear();

      void session.execute('cat', { stdin: 'data' });
      await vi.advanceTimersByTimeAsync(100);
      const eofWrite = mockWrite.mock.calls[2]?.[0] as string;
      expect(eofWrite).toBe('\x04'); // POSIX EOF
    });
  });

  describe('explicit shellType bypasses detection', () => {
    it('uses powershell adapter even when prompt looks like posix', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      // Prompt says posix, but config says powershell
      mockWaitForInitialPrompt.mockResolvedValue('user@host:~$ ');
      const session = new ShellSession({ shellType: 'powershell', stallTimeoutMs: null });
      await session.initialize(mockClient);
      expect(session.shellType).toBe('powershell');

      mockWrite.mockClear();
      void session.execute('test');
      const wrappedCmd = mockWrite.mock.calls[0][0] as string;
      expect(wrappedCmd).toContain('Write-Host');
    });

    it('uses posix adapter even when prompt looks like cmd', async () => {
      const { ShellSession } = await import('../../../src/ssh/shell-session.js');
      mockWaitForInitialPrompt.mockResolvedValue('C:\\Windows>');
      const session = new ShellSession({ shellType: 'posix', stallTimeoutMs: null });
      await session.initialize(mockClient);
      expect(session.shellType).toBe('posix');

      mockWrite.mockClear();
      void session.execute('test');
      const wrappedCmd = mockWrite.mock.calls[0][0] as string;
      expect(wrappedCmd).toContain('__MCP_EXIT=$?');
    });
  });
});
