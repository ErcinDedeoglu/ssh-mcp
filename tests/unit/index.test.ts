import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fileURLToPath } from 'node:url';

const indexUrl = new URL('../../src/index.js', import.meta.url).href;
const fakeEntry = fileURLToPath(new URL('../../src/index.ts', import.meta.url));

describe('Entry Point (index.ts)', () => {
  const mockRun = vi.fn().mockResolvedValue(undefined);
  const mockShutdown = vi.fn().mockResolvedValue(undefined);
  let signalHandlers: Map<string, () => void>;
  let originalArgv: string[];
  let originalProcessExit: typeof process.exit;

  beforeEach(async () => {
    vi.resetModules();
    signalHandlers = new Map();
    originalArgv = process.argv;

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
    process.argv = originalArgv;
    process.exit = originalProcessExit;
    vi.restoreAllMocks();
    mockRun.mockClear();
    mockShutdown.mockClear();
  });

  /** Sets argv to make index.ts look like the main module with the given CLI args. */
  function setArgv(...cliArgs: string[]): void {
    process.argv = [process.argv[0], fakeEntry, ...cliArgs];
  }

  describe('MCP mode (backwards compatible)', () => {
    it('loads config and creates server when invoked with no arguments', async () => {
      setArgv();
      const { main } = await import(indexUrl);
      await main();

      const { loadConfig } = await import('../../src/config/loader.js');
      const { SSHMCPServer } = await import('../../src/server.js');

      expect(loadConfig).toHaveBeenCalled();
      expect(SSHMCPServer).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalled();
    });

    it('runs the MCP stdio server for explicit `mcp` argument', async () => {
      setArgv('mcp');
      const { main } = await import(indexUrl);
      await main();
      expect(mockRun).toHaveBeenCalled();
    });

    it('registers SIGINT handler', async () => {
      setArgv();
      const { main } = await import(indexUrl);
      await main();

      expect(signalHandlers.has('SIGINT')).toBe(true);
    });

    it('registers SIGTERM handler', async () => {
      setArgv();
      const { main } = await import(indexUrl);
      await main();

      expect(signalHandlers.has('SIGTERM')).toBe(true);
    });

    it('SIGINT triggers shutdown', async () => {
      setArgv();
      const { main } = await import(indexUrl);
      await main();

      const sigintHandler = signalHandlers.get('SIGINT');
      expect(sigintHandler).toBeDefined();

      sigintHandler!();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockShutdown).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('SIGTERM triggers shutdown', async () => {
      setArgv();
      const { main } = await import(indexUrl);
      await main();

      const sigtermHandler = signalHandlers.get('SIGTERM');
      expect(sigtermHandler).toBeDefined();

      sigtermHandler!();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockShutdown).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('CLI mode', () => {
    it('dispatches to CLI for non-mcp arguments and does not start the MCP server', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setArgv('servers');

      const { main } = await import(indexUrl);
      await main();

      expect(mockRun).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();

      logSpy.mockRestore();
    });
  });
});
