import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ForwardStore } from '../../../src/cli/forward-store.js';

describe('ForwardStore', () => {
  let file: string;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-fwd-'));
    file = path.join(dir, 'forwards.json');
  });

  afterEach(() => {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('adds and lists live entries', () => {
    const store = new ForwardStore(file);
    store.add({
      kind: 'local',
      serverId: 'srv',
      localHost: '127.0.0.1',
      localPort: 8080,
      remoteHost: 'db',
      remotePort: 5432,
      pid: process.pid,
      createdAt: Date.now(),
    });

    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ serverId: 'srv', localPort: 8080, kind: 'local' });
  });

  it('prunes entries of dead processes', () => {
    const store = new ForwardStore(file);
    store.add({ kind: 'local', serverId: 'a', pid: 999999, createdAt: 1 });
    store.add({ kind: 'remote', serverId: 'b', pid: process.pid, createdAt: 2 });

    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].serverId).toBe('b');

    // Pruned on disk too
    expect(new ForwardStore(file).list()).toHaveLength(1);
  });

  it('removeByPid removes only the matching entry', () => {
    const store = new ForwardStore(file);
    store.add({ kind: 'local', serverId: 'a', pid: 111, createdAt: 1 });
    store.add({ kind: 'local', serverId: 'b', pid: 222, createdAt: 2 });

    store.removeByPid(111);

    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Array<{ pid: number }>;
    expect(raw).toHaveLength(1);
    expect(raw[0].pid).toBe(222);
  });

  it('returns empty list when file missing', () => {
    expect(new ForwardStore(file).list()).toEqual([]);
  });
});
