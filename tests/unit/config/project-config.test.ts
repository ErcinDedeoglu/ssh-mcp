import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { vi } from 'vitest';

const homeMock = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => homeMock.dir };
});

const { loadConfig, getServerConfigPath } = await import('../../../src/config/loader.js');

describe('project config merge (loader.ts)', () => {
  let root: string;
  let home: string;
  let originalEnv: string | undefined;
  let originalArgv: string[];

  function writeCentral(servers: Array<Record<string, unknown>>): string {
    fs.mkdirSync(path.join(home, '.ssh-mcp'), { recursive: true });
    const file = path.join(home, '.ssh-mcp', 'config.json');
    fs.writeFileSync(file, JSON.stringify({ servers }, null, 2));
    fs.chmodSync(file, 0o600);
    return file;
  }

  function writeProject(
    dir: string,
    content: Record<string, unknown>,
    mode: number = 0o600,
  ): string {
    const file = path.join(dir, '.ssh-mcp.json');
    fs.writeFileSync(file, JSON.stringify(content, null, 2));
    fs.chmodSync(file, mode);
    return file;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-proj-'));
    home = path.join(root, 'home');
    fs.mkdirSync(home, { recursive: true });
    originalEnv = process.env.SSH_MCP_CONFIG;
    delete process.env.SSH_MCP_CONFIG;
    originalArgv = process.argv;
    homeMock.dir = home;
  });

  afterEach(() => {
    process.env.SSH_MCP_CONFIG = originalEnv;
    if (originalEnv === undefined) delete process.env.SSH_MCP_CONFIG;
    process.argv = originalArgv;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('merges project servers over central by id and appends new ones', () => {
    const centralFile = writeCentral([
      { id: 'shared', host: 'central.example', port: 22, username: 'u', auth: { password: 'p' } },
      { id: 'central-only', host: 'c2.example', port: 22, username: 'u', auth: { password: 'p' } },
    ]);
    const proj = path.join(root, 'proj');
    fs.mkdirSync(proj);
    const projectFile = writeProject(proj, {
      servers: [
        {
          id: 'shared',
          host: 'project.example',
          port: 2222,
          username: 'v',
          auth: { password: 'q' },
        },
        { id: 'proj-extra', host: 'p2.example', port: 22, username: 'w', auth: { password: 'r' } },
      ],
    });

    const config = loadConfig({ startDir: proj });

    const ids = config.servers.map((s) => s.id).sort();
    expect(ids).toEqual(['central-only', 'proj-extra', 'shared']);
    const shared = config.servers.find((s) => s.id === 'shared');
    expect(shared?.host).toBe('project.example');
    expect(shared?.port).toBe(2222);

    expect(getServerConfigPath('shared')).toBe(projectFile);
    expect(getServerConfigPath('central-only')).toBe(centralFile);
  });

  it('accepts a project file with only keys/defaults (no servers)', () => {
    writeCentral([
      { id: 'a', host: 'a.example', port: 22, username: 'u', auth: { password: 'p' } },
    ]);
    const proj = path.join(root, 'proj2');
    fs.mkdirSync(proj);
    writeProject(proj, { defaults: { timeouts: { command: 120 } } });

    const config = loadConfig({ startDir: proj });
    expect(config.servers).toHaveLength(1);
    expect(config.defaults?.timeouts?.command).toBe(120);
  });

  it('merges keys with project winning by name', () => {
    const centralFile = writeCentral([
      { id: 'a', host: 'a.example', port: 22, username: 'u', auth: { password: 'p' } },
    ]);
    const raw = JSON.parse(fs.readFileSync(centralFile, 'utf-8'));
    raw.keys = { central: 'original' };
    fs.writeFileSync(centralFile, JSON.stringify(raw, null, 2));
    const proj = path.join(root, 'proj3');
    fs.mkdirSync(proj);
    writeProject(proj, { keys: { central: 'overridden', fresh: 'new-key' } });

    const config = loadConfig({ startDir: proj });
    expect(config.keys).toMatchObject({ central: 'overridden', fresh: 'new-key' });
  });

  it('ignores project config when SSH_MCP_CONFIG is set', () => {
    writeCentral([
      { id: 'a', host: 'a.example', port: 22, username: 'u', auth: { password: 'p' } },
    ]);
    const proj = path.join(root, 'proj4');
    fs.mkdirSync(proj);
    writeProject(proj, {
      servers: [
        { id: 'proj', host: 'p.example', port: 22, username: 'u', auth: { password: 'p' } },
      ],
    });
    process.env.SSH_MCP_CONFIG = path.join(home, '.ssh-mcp', 'config.json');

    const config = loadConfig({ startDir: proj });
    expect(config.servers.map((s) => s.id)).toEqual(['a']);
  });

  it('accepts a 0644 project file (git-tracked) but rejects group/other write', () => {
    writeCentral([
      { id: 'a', host: 'a.example', port: 22, username: 'u', auth: { password: 'p' } },
    ]);
    const proj = path.join(root, 'proj5');
    fs.mkdirSync(proj);

    // 0644: what git checkouts produce - must load fine
    writeProject(
      proj,
      {
        servers: [{ id: 'x', host: 'x.example', port: 22, username: 'u', auth: { password: 'p' } }],
      },
      0o644,
    );
    const config = loadConfig({ startDir: proj });
    expect(config.servers.map((s) => s.id)).toContain('x');

    // 0666/0646: group/other WRITABLE - must throw
    writeProject(
      proj,
      {
        servers: [{ id: 'x', host: 'x.example', port: 22, username: 'u', auth: { password: 'p' } }],
      },
      0o666,
    );
    expect(() => loadConfig({ startDir: proj })).toThrow(/Insecure file permissions/);
  });

  it('still enforces 0600 on the central config', () => {
    const central = writeCentral([
      { id: 'a', host: 'a.example', port: 22, username: 'u', auth: { password: 'p' } },
    ]);
    fs.chmodSync(central, 0o644);

    expect(() => loadConfig()).toThrow(/Insecure file permissions/);
  });

  it('surfaces invalid project JSON with the file path', () => {
    writeCentral([
      { id: 'a', host: 'a.example', port: 22, username: 'u', auth: { password: 'p' } },
    ]);
    const proj = path.join(root, 'proj6');
    fs.mkdirSync(proj);
    const file = path.join(proj, '.ssh-mcp.json');
    fs.writeFileSync(file, '{broken');
    fs.chmodSync(file, 0o600);

    expect(() => loadConfig({ startDir: proj })).toThrow(/Invalid JSON in config file .+proj6/);
  });
});
