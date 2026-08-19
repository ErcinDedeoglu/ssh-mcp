import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const forwardPortMock = vi.hoisted(() => vi.fn());
const jumpConnectMock = vi.hoisted(() => vi.fn());
const buildCliDepsMock = vi.hoisted(() => vi.fn());
const cleanupCliMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/actions/forward-port.js', () => ({ forwardPort: forwardPortMock }));
vi.mock('../../../../src/actions/jump-connect.js', () => ({ jumpConnect: jumpConnectMock }));
vi.mock('../../../../src/cli/context.js', () => ({
  buildCliDeps: buildCliDepsMock,
  cleanupCli: cleanupCliMock,
}));

const { registerForwardCommands } = await import('../../../../src/cli/commands/forward.js');
const { captureConsole, runCapturingExit, ok, fail } =
  await import('../_fixtures/cli-command.helpers.js');
const { ForwardStore } = await import('../../../../src/cli/forward-store.js');

const DEPS = Symbol('deps');

describe('forward command (foreground local)', () => {
  let cap: ReturnType<typeof captureConsole>;
  let dir: string;
  let originalConfig: string | undefined;

  beforeEach(() => {
    cap = captureConsole();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-fwdcmd-'));
    originalConfig = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = path.join(dir, 'config.json');
    forwardPortMock.mockReset();
    jumpConnectMock.mockReset();
    buildCliDepsMock.mockReset();
    buildCliDepsMock.mockReturnValue(DEPS);
    cleanupCliMock.mockReset();
  });

  afterEach(() => {
    cap.restore();
    if (originalConfig !== undefined) process.env.SSH_MCP_CONFIG = originalConfig;
    else delete process.env.SSH_MCP_CONFIG;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('registers the forward, waits, and cleans up on SIGINT', async () => {
    forwardPortMock.mockResolvedValue(
      ok({
        status: 'forwarding',
        serverId: 's',
        localHost: '127.0.0.1',
        localPort: 15432,
        remoteHost: 'db',
        remotePort: 5432,
        connectionString: '127.0.0.1:15432 -> db:5432',
      }),
    );

    const signalHandlers = new Map<string, () => void>();
    const onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation((event: string | symbol, handler: (...args: unknown[]) => void) => {
        if (event === 'SIGINT' || event === 'SIGTERM') {
          signalHandlers.set(event as string, handler as () => void);
        }
        return process;
      });

    const store = new ForwardStore(path.join(dir, 'forwards.json'));
    const running = runCapturingExit(registerForwardCommands, [
      'forward',
      's',
      'db',
      '5432',
      '--local-port',
      '15432',
    ]);

    await vi.waitFor(() => expect(store.list()).toHaveLength(1));
    expect(cap.errors.join('')).toContain('127.0.0.1:15432 -> db:5432');

    signalHandlers.get('SIGINT')!();
    const code = await running;

    onSpy.mockRestore();
    expect(code ?? 0).toBe(0);
    expect(store.list()).toHaveLength(0); // entry removed on shutdown
    expect(cleanupCliMock).toHaveBeenCalledWith(DEPS);
  });

  it('exits 1 without registering when the forward fails', async () => {
    forwardPortMock.mockResolvedValue(fail('Port 80 already in use'));

    const code = await runCapturingExit(registerForwardCommands, ['forward', 's', 'db', '5432']);

    expect(cap.errors.join('')).toContain('already in use');
    expect(code).toBe(1);
    expect(cleanupCliMock).not.toHaveBeenCalled();
    expect(new ForwardStore(path.join(dir, 'forwards.json')).list()).toHaveLength(0);
  });

  it('connects through the jump host first when --via is given', async () => {
    jumpConnectMock.mockResolvedValue(ok({ status: 'connected', targetServerId: 's' }));
    forwardPortMock.mockResolvedValue(
      ok({
        status: 'forwarding',
        serverId: 's',
        localHost: '127.0.0.1',
        localPort: 1,
        remoteHost: 'db',
        remotePort: 2,
        connectionString: 'x',
      }),
    );
    const signalHandlers = new Map<string, () => void>();
    const onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation((event: string | symbol, handler: () => void) => {
        if (event === 'SIGINT' || event === 'SIGTERM') signalHandlers.set(event as string, handler);
        return process;
      });

    const running = runCapturingExit(registerForwardCommands, [
      'forward',
      's',
      'db',
      '5432',
      '--via',
      'bastion',
    ]);
    const store = new ForwardStore(path.join(dir, 'forwards.json'));
    await vi.waitFor(() => expect(store.list()).toHaveLength(1));
    signalHandlers.get('SIGINT')!();
    await running;
    onSpy.mockRestore();

    expect(jumpConnectMock).toHaveBeenCalledWith(
      { jumpServerId: 'bastion', targetServerId: 's' },
      DEPS,
    );
    expect(forwardPortMock).toHaveBeenCalled();
  });
});
