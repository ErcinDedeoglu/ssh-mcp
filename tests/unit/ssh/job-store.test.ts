import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JobStore } from '../../../src/ssh/job-store.js';

describe('JobStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-jobs-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('save/read', () => {
    it('persists and reads back job metadata', () => {
      const store = new JobStore(dir);
      store.save({
        id: 'job_x',
        serverId: 'srv',
        command: 'echo hi',
        status: 'running',
        startedAt: 1000,
        pid: 42,
      });

      const meta = store.read('job_x');
      expect(meta).toMatchObject({
        id: 'job_x',
        serverId: 'srv',
        command: 'echo hi',
        status: 'running',
        startedAt: 1000,
        pid: 42,
      });
    });

    it('returns undefined for unknown job', () => {
      expect(new JobStore(dir).read('nope')).toBeUndefined();
    });
  });

  describe('output', () => {
    it('appends streamed output and reports mtime', async () => {
      const store = new JobStore(dir);
      store.appendOutput('job_y', 'chunk1 ');
      store.appendOutput('job_y', 'chunk2');

      expect(store.readOutput('job_y')).toBe('chunk1 chunk2');
      expect(store.outputMtime('job_y')).toBeGreaterThan(0);
      expect(store.readOutput('unknown')).toBe('');
    });
  });

  describe('list', () => {
    it('lists jobs most recent first', () => {
      const store = new JobStore(dir);
      store.save({ id: 'old', serverId: 'a', command: 'c', status: 'completed', startedAt: 1 });
      store.save({ id: 'new', serverId: 'a', command: 'c', status: 'running', startedAt: 2 });

      const ids = store.list().map((m) => m.id);
      expect(ids).toEqual(['new', 'old']);
    });
  });

  describe('remove', () => {
    it('deletes metadata and output files', () => {
      const store = new JobStore(dir);
      store.save({ id: 'z', serverId: 'a', command: 'c', status: 'running', startedAt: 1 });
      store.appendOutput('z', 'out');

      store.remove('z');

      expect(store.read('z')).toBeUndefined();
      expect(store.readOutput('z')).toBe('');
    });
  });

  describe('prune', () => {
    it('drops terminal jobs older than 24h', () => {
      const store = new JobStore(dir);
      const dayMs = 24 * 60 * 60 * 1000;
      store.save({
        id: 'stale',
        serverId: 'a',
        command: 'c',
        status: 'completed',
        startedAt: 1,
        completedAt: 1,
      });
      store.save({
        id: 'fresh',
        serverId: 'a',
        command: 'c',
        status: 'completed',
        startedAt: Date.now() - 1000,
        completedAt: Date.now() - 1000,
      });
      store.save({
        id: 'still-running',
        serverId: 'a',
        command: 'c',
        status: 'running',
        startedAt: 1,
      });
      void dayMs;

      store.prune();

      const ids = store.list().map((m) => m.id);
      expect(ids).toContain('fresh');
      expect(ids).toContain('still-running');
      expect(ids).not.toContain('stale');
    });
  });

  describe('newId', () => {
    it('generates job_-prefixed unique ids', () => {
      const store = new JobStore(dir);
      const a = store.newId();
      const b = store.newId();
      expect(a).toMatch(/^job_/);
      expect(a).not.toBe(b);
    });
  });
});
