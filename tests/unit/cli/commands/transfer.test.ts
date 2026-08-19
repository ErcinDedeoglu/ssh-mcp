import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const uploadFileMock = vi.hoisted(() => vi.fn());
const downloadFileMock = vi.hoisted(() => vi.fn());
const buildCliDepsMock = vi.hoisted(() => vi.fn());
const cleanupCliMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/actions/upload.js', () => ({ uploadFile: uploadFileMock }));
vi.mock('../../../../src/actions/download.js', () => ({ downloadFile: downloadFileMock }));
vi.mock('../../../../src/cli/context.js', () => ({
  buildCliDeps: buildCliDepsMock,
  cleanupCli: cleanupCliMock,
}));

const { registerTransferCommands } = await import('../../../../src/cli/commands/transfer.js');
const { captureConsole, runCapturingExit, ok, fail } =
  await import('../_fixtures/cli-command.helpers.js');

const DEPS = Symbol('deps');

describe('transfer command handlers', () => {
  let cap: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    cap = captureConsole();
    uploadFileMock.mockReset();
    downloadFileMock.mockReset();
    buildCliDepsMock.mockReset();
    buildCliDepsMock.mockReturnValue(DEPS);
    cleanupCliMock.mockReset();
  });

  afterEach(() => cap.restore());

  it('upload prints human confirmation on success', async () => {
    uploadFileMock.mockResolvedValue(
      ok({ status: 'uploaded', serverId: 's', localPath: '~/f.txt', remotePath: '/tmp/f.txt' }),
    );

    const code = await runCapturingExit(registerTransferCommands, [
      'upload',
      's',
      './f.txt',
      '/tmp/f.txt',
    ]);

    expect(uploadFileMock).toHaveBeenCalledWith(
      { serverId: 's', localPath: './f.txt', remotePath: '/tmp/f.txt' },
      DEPS,
    );
    expect(cap.logs.join('')).toContain('Uploaded ./f.txt -> s:/tmp/f.txt');
    expect(code ?? 0).toBe(0);
  });

  it('upload --json prints the action payload', async () => {
    uploadFileMock.mockResolvedValue(
      ok({ status: 'uploaded', serverId: 's', localPath: 'l', remotePath: 'r' }),
    );

    await runCapturingExit(registerTransferCommands, ['upload', 's', 'l', 'r', '--json']);

    expect(JSON.parse(cap.logs.join(''))).toMatchObject({ status: 'uploaded' });
  });

  it('upload failure exits 1 with error on stderr', async () => {
    uploadFileMock.mockResolvedValue(fail('File too large'));

    const code = await runCapturingExit(registerTransferCommands, ['upload', 's', 'l', 'r']);

    expect(cap.errors.join('')).toContain('File too large');
    expect(code).toBe(1);
  });

  it('download prints human confirmation on success', async () => {
    downloadFileMock.mockResolvedValue(
      ok({ status: 'downloaded', serverId: 's', remotePath: '/tmp/r', localPath: '~/l' }),
    );

    const code = await runCapturingExit(registerTransferCommands, [
      'download',
      's',
      '/tmp/r',
      './l',
    ]);

    expect(downloadFileMock).toHaveBeenCalledWith(
      { serverId: 's', remotePath: '/tmp/r', localPath: './l' },
      DEPS,
    );
    expect(cap.logs.join('')).toContain('Downloaded s:/tmp/r -> ./l');
    expect(code ?? 0).toBe(0);
  });

  it('download failure exits 1', async () => {
    downloadFileMock.mockResolvedValue(fail('No such file'));

    const code = await runCapturingExit(registerTransferCommands, ['download', 's', 'r', 'l']);

    expect(cap.errors.join('')).toContain('No such file');
    expect(code).toBe(1);
  });

  it('always cleans up deps', async () => {
    uploadFileMock.mockResolvedValue(
      ok({ status: 'uploaded', serverId: 's', localPath: 'l', remotePath: 'r' }),
    );

    await runCapturingExit(registerTransferCommands, ['upload', 's', 'l', 'r']);

    expect(cleanupCliMock).toHaveBeenCalledWith(DEPS);
  });
});
