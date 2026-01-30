import { describe, it, expect, beforeEach } from 'vitest';
import { JobRegistry } from '../../../src/ssh/job-registry.js';

describe('JobRegistry streaming output', () => {
  let registry: JobRegistry;

  beforeEach(() => {
    registry = new JobRegistry();
  });

  describe('appendOutput', () => {
    it('appends to job output and tracks bytesReceived', () => {
      const job = registry.create('server1', 'cmd');
      registry.appendOutput(job.id, 'chunk1');
      registry.appendOutput(job.id, 'chunk2');
      const updated = registry.get(job.id)!;
      expect(updated.output).toBe('chunk1chunk2');
      expect(updated.bytesReceived).toBe(12);
    });

    it('updates lastOutputAt timestamp', () => {
      const job = registry.create('server1', 'cmd');
      expect(registry.get(job.id)?.lastOutputAt).toBeUndefined();
      registry.appendOutput(job.id, 'data');
      expect(registry.get(job.id)?.lastOutputAt).toBeGreaterThan(0);
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
      expect(registry.get(job.id)?.bytesReceived).toBe(4);
    });
  });

  describe('create initializes streaming fields', () => {
    it('initializes bytesReceived to 0', () => {
      const job = registry.create('server1', 'cmd');
      expect(job.bytesReceived).toBe(0);
    });

    it('initializes lastOutputAt as undefined', () => {
      const job = registry.create('server1', 'cmd');
      expect(job.lastOutputAt).toBeUndefined();
    });
  });
});
