import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Entry Point (index.ts)', () => {
  const mockRun = vi.fn().mockResolvedValue(undefined);
  const mockShutdown = vi.fn().mockResolvedValue(undefined);
  let signalHandlers: Map<string, () => void>;
  let originalProcessExit: typeof process.exit;

  beforeEach(async () => {
    vi.resetModules();
    signalHandlers = new Map();

    vi.doMock('../../src/config/loader.js', () => ({
      loadConfig: vi.fn(() => ({
        servers: [
          {
            id: 'test-server',
            host: '192.168.1.100',
            port: 22,
            username: 'ubuntu',
            auth: { password: 'secret123' },
          },
        ],
      })),
    }));

    vi.doMock('../../src/server.js', () => ({
      SSHMCPServer: vi.fn().mockImplementation(() => ({
        run: mockRun,
        shutdown: mockShutdown,
      })),
    }));

    vi.spyOn(process, 'on').mockImplementation(
      (event: string | symbol, handler: (...args: unknown[]) => void) => {
        if (event === 'SIGINT' || event === 'SIGTERM') {
          signalHandlers.set(event as string, handler as () => void);
        }
        return process;
      },
    );

    originalProcessExit = process.exit;
    process.exit = vi.fn() as never;
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    vi.restoreAllMocks();
    mockRun.mockClear();
    mockShutdown.mockClear();
  });

  describe('main', () => {
    it('loads config and creates server', async () => {
      const { main } = await import('../../src/index.js');
      const { loadConfig } = await import('../../src/config/loader.js');
      const { SSHMCPServer } = await import('../../src/server.js');

      await main();

      expect(loadConfig).toHaveBeenCalled();
      expect(SSHMCPServer).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalled();
    });

    it('registers SIGINT handler', async () => {
      const { main } = await import('../../src/index.js');

      await main();

      expect(signalHandlers.has('SIGINT')).toBe(true);
    });

    it('registers SIGTERM handler', async () => {
      const { main } = await import('../../src/index.js');

      await main();

      expect(signalHandlers.has('SIGTERM')).toBe(true);
    });
  });

  describe('signal handling', () => {
    it('SIGINT triggers shutdown', async () => {
      const { main } = await import('../../src/index.js');

      await main();

      const sigintHandler = signalHandlers.get('SIGINT');
      expect(sigintHandler).toBeDefined();

      sigintHandler!();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockShutdown).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('SIGTERM triggers shutdown', async () => {
      const { main } = await import('../../src/index.js');

      await main();

      const sigtermHandler = signalHandlers.get('SIGTERM');
      expect(sigtermHandler).toBeDefined();

      sigtermHandler!();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockShutdown).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });
});
