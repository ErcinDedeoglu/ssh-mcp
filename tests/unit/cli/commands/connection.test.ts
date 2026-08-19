import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const listServersMock = vi.hoisted(() => vi.fn());
const connectionStatusMock = vi.hoisted(() => vi.fn());
const jumpConnectMock = vi.hoisted(() => vi.fn());
const executeCommandMock = vi.hoisted(() => vi.fn());
const buildCliDepsMock = vi.hoisted(() => vi.fn());
const cleanupCliMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/actions/list-servers.js', () => ({ listServers: listServersMock }));
vi.mock('../../../../src/actions/connection-status.js', () => ({
  connectionStatus: connectionStatusMock,
}));
vi.mock('../../../../src/actions/jump-connect.js', () => ({ jumpConnect: jumpConnectMock }));
vi.mock('../../../../src/actions/execute.js', () => ({ executeCommand: executeCommandMock }));
vi.mock('../../../../src/cli/context.js', () => ({
  buildCliDeps: buildCliDepsMock,
  cleanupCli: cleanupCliMock,
}));

const { registerConnectionCommands } = await import('../../../../src/cli/commands/connection.js');
const { captureConsole, runCapturingExit, ok, fail } =
  await import('../_fixtures/cli-command.helpers.js');

const DEPS = Symbol('deps');

describe('connection command handlers', () => {
  let cap: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    cap = captureConsole();
    listServersMock.mockReset();
    connectionStatusMock.mockReset();
    jumpConnectMock.mockReset();
    executeCommandMock.mockReset();
    buildCliDepsMock.mockReset();
    buildCliDepsMock.mockReturnValue(DEPS);
    cleanupCliMock.mockReset();
  });

  afterEach(() => cap.restore());

  it('servers prints one line per server with connection state', async () => {
    listServersMock.mockResolvedValue(
      ok([
        { id: 'web', host: 'h1', port: 22, username: 'u', connected: false },
        { id: 'db', host: 'h2', port: 22, username: 'u', connected: true },
      ]),
    );

    const code = await runCapturingExit(registerConnectionCommands, ['servers']);

    const out = cap.logs.join('');
    expect(out).toContain('web');
    expect(out).toContain('u@h1:22');
    expect(out).toContain('[-]');
    expect(out).toContain('[connected]');
    expect(code ?? 0).toBe(0);
  });

  it('servers --json prints the raw array', async () => {
    listServersMock.mockResolvedValue(ok([{ id: 'x', host: 'y', port: 1, username: 'u' }]));

    await runCapturingExit(registerConnectionCommands, ['servers', '--json']);

    const parsed = JSON.parse(cap.logs.join('')) as Array<{ id: string }>;
    expect(parsed[0].id).toBe('x');
  });

  it('status prints a human health line', async () => {
    connectionStatusMock.mockResolvedValue(
      ok({
        serverId: 'web',
        connected: true,
        idle: false,
        reconnecting: false,
        lastActivityMs: 123,
        lastActivityAgo: '4s',
      }),
    );

    const code = await runCapturingExit(registerConnectionCommands, ['status', 'web']);

    expect(connectionStatusMock).toHaveBeenCalledWith({ serverId: 'web' }, DEPS);
    expect(cap.logs.join('')).toContain('web: connected, idle=false, lastActivity=4s ago');
    expect(code ?? 0).toBe(0);
  });

  it('status failure exits 1', async () => {
    connectionStatusMock.mockResolvedValue(fail('connect ECONNREFUSED'));

    const code = await runCapturingExit(registerConnectionCommands, ['status', 'nope']);

    expect(cap.errors.join('')).toContain('ECONNREFUSED');
    expect(code).toBe(1);
  });

  it('jump without command reports the established tunnel', async () => {
    jumpConnectMock.mockResolvedValue(
      ok({ status: 'connected', targetServerId: 'db', host: '10.0.0.2', port: 22 }),
    );

    const code = await runCapturingExit(registerConnectionCommands, ['jump', 'bastion', 'db']);

    expect(jumpConnectMock).toHaveBeenCalledWith(
      { jumpServerId: 'bastion', targetServerId: 'db' },
      DEPS,
    );
    expect(cap.logs.join('')).toContain('connected: db (10.0.0.2:22) via bastion');
    expect(code ?? 0).toBe(0);
  });

  it('jump with command executes it on the target and propagates exit code', async () => {
    jumpConnectMock.mockResolvedValue(
      ok({ status: 'connected', targetServerId: 'db', host: 'h', port: 22 }),
    );
    executeCommandMock.mockResolvedValue(
      ok({
        serverId: 'db',
        command: 'uptime',
        stdout: 'up 1m\n',
        stderr: '',
        exitCode: 0,
        truncated: false,
      }),
    );

    const code = await runCapturingExit(registerConnectionCommands, [
      'jump',
      'bastion',
      'db',
      'uptime',
    ]);

    expect(executeCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'db', command: 'uptime' }),
      DEPS,
    );
    expect(cap.stdout).toBe('up 1m\n');
    expect(code).toBe(0);
  });

  it('jump failure exits 1 before executing anything', async () => {
    jumpConnectMock.mockResolvedValue(fail('Target not found', { error: 'server_not_found' }));

    const code = await runCapturingExit(registerConnectionCommands, ['jump', 'a', 'b', 'x']);

    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(cap.errors.join('')).toContain('server_not_found');
    expect(code).toBe(1);
  });

  it('always cleans up deps', async () => {
    listServersMock.mockResolvedValue(ok([]));

    await runCapturingExit(registerConnectionCommands, ['servers']);

    expect(cleanupCliMock).toHaveBeenCalledWith(DEPS);
  });
});
