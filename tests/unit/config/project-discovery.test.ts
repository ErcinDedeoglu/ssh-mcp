import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const { findProjectConfig, hasExplicitConfigOverride } =
  await import('../../../src/config/path.js');

describe('project config discovery (path.ts)', () => {
  let root: string;
  let originalEnv: string | undefined;
  let originalArgv: string[];

  function writeProject(dir: string): string {
    const file = path.join(dir, '.ssh-mcp.json');
    fs.writeFileSync(file, JSON.stringify({ servers: [] }));
    fs.chmodSync(file, 0o600);
    return file;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-disc-'));
    originalEnv = process.env.SSH_MCP_CONFIG;
    delete process.env.SSH_MCP_CONFIG;
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.env.SSH_MCP_CONFIG = originalEnv;
    if (originalEnv === undefined) delete process.env.SSH_MCP_CONFIG;
    process.argv = originalArgv;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds .ssh-mcp.json in the starting directory', () => {
    const proj = path.join(root, 'proj');
    fs.mkdirSync(proj);
    const file = writeProject(proj);

    expect(findProjectConfig(proj)).toBe(file);
  });

  it('walks up to parent directories (nearest wins)', () => {
    const proj = path.join(root, 'proj');
    const nearer = path.join(proj, 'src');
    const nested = path.join(nearer, 'deep');
    fs.mkdirSync(nested, { recursive: true });
    writeProject(proj);
    const nearerFile = writeProject(nearer);

    expect(findProjectConfig(nested)).toBe(nearerFile);
  });

  it('returns undefined when none exists up to root', () => {
    const empty = path.join(root, 'empty');
    fs.mkdirSync(empty);

    expect(findProjectConfig(empty)).toBeUndefined();
  });

  it('override detection: false by default', () => {
    expect(hasExplicitConfigOverride()).toBe(false);
  });

  it('override detection: true with SSH_MCP_CONFIG env', () => {
    process.env.SSH_MCP_CONFIG = '/tmp/x.json';
    expect(hasExplicitConfigOverride()).toBe(true);
  });

  it('override detection: true with --config argv', () => {
    process.argv = ['node', 'ssh-mcp', '--config', '/tmp/y.json'];
    expect(hasExplicitConfigOverride()).toBe(true);
  });
});
