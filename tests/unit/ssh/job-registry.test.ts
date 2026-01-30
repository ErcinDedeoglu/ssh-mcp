import { describe, it, expect, beforeEach } from 'vitest';
import { JobRegistry } from '../../../src/ssh/job-registry.js';

describe('JobRegistry', () => {
  let registry: JobRegistry;

  beforeEach(() => {
    registry = new JobRegistry();
  });

  describe('create', () => {
    it('creates a job with pending status', () => {
      const job = registry.create('server1', 'echo hello');
      expect(job.id).toMatch(/^job_/);
      expect(job.serverId).toBe('server1');
      expect(job.command).toBe('echo hello');
      expect(job.status).toBe('pending');
      expect(job.startedAt).toBeGreaterThan(0);
      expect(job.output).toBe('');
    });

    it('generates unique job IDs', () => {
      const job1 = registry.create('server1', 'cmd1');
      const job2 = registry.create('server1', 'cmd2');
      expect(job1.id).not.toBe(job2.id);
    });
  });

  describe('get', () => {
    it('returns job by ID', () => {
      const created = registry.create('server1', 'cmd');
      const retrieved = registry.get(created.id);
      expect(retrieved).toBe(created);
    });

    it('returns undefined for unknown ID', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('updates job status to running', () => {
      const job = registry.create('server1', 'cmd');
      registry.updateStatus(job.id, 'running');
      expect(registry.get(job.id)?.status).toBe('running');
    });

    it('sets completedAt when status is completed', () => {
      const job = registry.create('server1', 'cmd');
      registry.updateStatus(job.id, 'completed');
      expect(registry.get(job.id)?.completedAt).toBeGreaterThan(0);
    });

    it('sets completedAt when status is failed', () => {
      const job = registry.create('server1', 'cmd');
      registry.updateStatus(job.id, 'failed');
      expect(registry.get(job.id)?.completedAt).toBeGreaterThan(0);
    });

    it('sets completedAt when status is cancelled', () => {
      const job = registry.create('server1', 'cmd');
      registry.updateStatus(job.id, 'cancelled');
      expect(registry.get(job.id)?.completedAt).toBeGreaterThan(0);
    });

    it('does not set completedAt for non-terminal status', () => {
      const job = registry.create('server1', 'cmd');
      registry.updateStatus(job.id, 'running');
      expect(registry.get(job.id)?.completedAt).toBeUndefined();
    });

    it('handles unknown job ID gracefully', () => {
      expect(() => registry.updateStatus('nonexistent', 'running')).not.toThrow();
    });

    it('allows status transitions pending -> running -> completed', () => {
      const job = registry.create('server1', 'cmd');
      expect(registry.get(job.id)?.status).toBe('pending');
      registry.updateStatus(job.id, 'running');
      expect(registry.get(job.id)?.status).toBe('running');
      registry.updateStatus(job.id, 'completed');
      expect(registry.get(job.id)?.status).toBe('completed');
    });
  });

  describe('setResult', () => {
    it('sets result and marks as completed', () => {
      const job = registry.create('server1', 'cmd');
      const result = { stdout: 'output', stderr: '', exitCode: 0 };
      registry.setResult(job.id, result);

      const updated = registry.get(job.id);
      expect(updated?.result).toEqual(result);
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeGreaterThan(0);
    });

    it('handles unknown job ID gracefully', () => {
      const result = { stdout: 'output', stderr: '', exitCode: 0 };
      expect(() => registry.setResult('nonexistent', result)).not.toThrow();
    });
  });

  describe('setError', () => {
    it('sets error and marks as failed', () => {
      const job = registry.create('server1', 'cmd');
      registry.setError(job.id, 'Connection lost');

      const updated = registry.get(job.id);
      expect(updated?.error).toBe('Connection lost');
      expect(updated?.status).toBe('failed');
      expect(updated?.completedAt).toBeGreaterThan(0);
    });

    it('handles unknown job ID gracefully', () => {
      expect(() => registry.setError('nonexistent', 'error')).not.toThrow();
    });
  });

  describe('appendOutput', () => {
    it('appends to job output', () => {
      const job = registry.create('server1', 'cmd');
      registry.appendOutput(job.id, 'chunk1');
      registry.appendOutput(job.id, 'chunk2');
      expect(registry.get(job.id)?.output).toBe('chunk1chunk2');
    });

    it('handles unknown job ID gracefully', () => {
      expect(() => registry.appendOutput('nonexistent', 'chunk')).not.toThrow();
    });

    it('handles empty string chunks', () => {
      const job = registry.create('server1', 'cmd');
      registry.appendOutput(job.id, '');
      registry.appendOutput(job.id, 'data');
      registry.appendOutput(job.id, '');
      expect(registry.get(job.id)?.output).toBe('data');
    });
  });

  describe('remove', () => {
    it('removes job and returns true', () => {
      const job = registry.create('server1', 'cmd');
      const result = registry.remove(job.id);
      expect(result).toBe(true);
      expect(registry.get(job.id)).toBeUndefined();
    });

    it('returns false for unknown ID', () => {
      expect(registry.remove('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('lists all jobs', () => {
      registry.create('server1', 'cmd1');
      registry.create('server2', 'cmd2');
      const jobs = registry.list();
      expect(jobs).toHaveLength(2);
    });

    it('filters by serverId', () => {
      registry.create('server1', 'cmd1');
      registry.create('server2', 'cmd2');
      registry.create('server1', 'cmd3');
      const jobs = registry.list('server1');
      expect(jobs).toHaveLength(2);
      expect(jobs.every((j) => j.serverId === 'server1')).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes all jobs', () => {
      registry.create('server1', 'cmd1');
      registry.create('server2', 'cmd2');
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });

  describe('size', () => {
    it('returns number of jobs', () => {
      expect(registry.size).toBe(0);
      registry.create('server1', 'cmd1');
      expect(registry.size).toBe(1);
      registry.create('server2', 'cmd2');
      expect(registry.size).toBe(2);
    });
  });
});
