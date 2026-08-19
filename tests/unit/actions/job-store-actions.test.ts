import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkJob } from '../../../src/actions/check-job.js';
import { cancelJob } from '../../../src/actions/cancel-job.js';
import { partialDeps } from '../../../src/tools/deps.js';
import { JobStore } from '../../../src/ssh/job-store.js';

describe('job actions with disk-backed store', () => {
  let dir: string;
  let store: JobStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-job-actions-'));
    store = new JobStore(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('checkJob', () => {
    it('reads jobs from the store when the registry misses', async () => {
      store.save({
        id: 'job_store1',
        serverId: 'srv',
        command: 'echo hi',
        status: 'completed',
        startedAt: Date.now() - 5000,
        completedAt: Date.now() - 1000,
        result: { stdout: 'hi', stderr: '', exitCode: 0 },
      });
      store.appendOutput('job_store1', 'hi');

      const outcome = await checkJob({ jobId: 'job_store1' }, partialDeps({ jobStore: store }));

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.status).toBe('completed');
        expect(outcome.data.partialOutput).toBe('hi');
        expect(outcome.data.result).toMatchObject({ stdout: 'hi', exitCode: 0 });
        expect(outcome.data.durationMs).toBeGreaterThanOrEqual(4000);
      }
    });

    it('reports bytesReceived from output file size', async () => {
      store.save({
        id: 'job_b',
        serverId: 'srv',
        command: 'c',
        status: 'running',
        startedAt: Date.now(),
      });
      store.appendOutput('job_b', 'abcdef');

      const outcome = await checkJob({ jobId: 'job_b' }, partialDeps({ jobStore: store }));
      if (outcome.ok) {
        expect(outcome.data.bytesReceived).toBe(6);
      }
    });

    it('fails with job_not_found when neither registry nor store has the job', async () => {
      const outcome = await checkJob({ jobId: 'ghost' }, partialDeps({ jobStore: store }));
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.json).toMatchObject({ error: 'job_not_found' });
      }
    });
  });

  describe('cancelJob', () => {
    it('marks a stored running job cancelled (dead runner pid)', async () => {
      store.save({
        id: 'job_c',
        serverId: 'srv',
        command: 'sleep 100',
        status: 'running',
        startedAt: Date.now(),
        pid: 999999, // not alive
      });

      const outcome = await cancelJob({ jobId: 'job_c' }, partialDeps({ jobStore: store }));

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.status).toBe('cancelled');
        expect(outcome.data.interruptSent).toBe(false);
      }
      expect(store.read('job_c')).toMatchObject({
        status: 'cancelled',
        error: 'Job cancelled by user',
      });
    });

    it('reports already-terminal stored jobs without changes', async () => {
      store.save({
        id: 'job_d',
        serverId: 'srv',
        command: 'c',
        status: 'completed',
        startedAt: 1,
        completedAt: 2,
      });

      const outcome = await cancelJob({ jobId: 'job_d' }, partialDeps({ jobStore: store }));
      if (outcome.ok) {
        expect(outcome.data.status).toBe('completed');
        expect(outcome.data.message).toBe('Job already completed');
      }
    });

    it('fails with job_not_found for unknown job', async () => {
      const outcome = await cancelJob({ jobId: 'ghost' }, partialDeps({ jobStore: store }));
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.json).toMatchObject({ error: 'job_not_found' });
      }
    });
  });
});
