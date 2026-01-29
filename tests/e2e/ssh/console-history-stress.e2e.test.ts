import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Stress & Boundary', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Rapid Successive Commands', () => {
    it('handles 50 rapid sequential commands without loss', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      for (let i = 0; i < 50; i++) {
        await shell.execute(`echo "rapid_${i}"`);
      }

      const history = shell.getHistory();
      expect(history).toHaveLength(50);

      for (let i = 0; i < 50; i++) {
        expect(history[i].stdout).toBe(`rapid_${i}`);
      }

      shell.destroy();
      session.disconnect();
    }, 120000);

    it('handles burst of concurrent commands', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 30000, stallTimeoutMs: 15000 });
      await shell.initialize(session.client);

      const promises = Array.from({ length: 20 }, (_, i) => shell.execute(`echo "burst_${i}"`));
      await Promise.all(promises);

      const history = shell.getHistory();
      expect(history).toHaveLength(20);

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Boundary Conditions', () => {
    it('handles output at exactly 50KB', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      const exactSize = 50 * 1024;
      await shell.execute(`head -c ${exactSize} /dev/zero | tr "\\0" "X"`);
      const entry = shell.getHistory()[0];

      expect(entry.stdout.length).toBe(exactSize);
      expect(entry.stdout).not.toContain('truncated');

      shell.destroy();
      session.disconnect();
    });

    it('handles output at 50KB + 1 byte', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      const overSize = 50 * 1024 + 1;
      await shell.execute(`head -c ${overSize} /dev/zero | tr "\\0" "Y"`);
      const entry = shell.getHistory()[0];

      expect(entry.stdout).toContain('truncated');

      shell.destroy();
      session.disconnect();
    });

    it('handles exactly 99 entries then adds 100th', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 120000, stallTimeoutMs: 60000 });
      await shell.initialize(session.client);

      for (let i = 0; i < 99; i++) {
        await shell.execute(`echo "${i}"`);
      }
      expect(shell.getHistory()).toHaveLength(99);

      await shell.execute('echo "100th"');
      expect(shell.getHistory()).toHaveLength(100);
      expect(shell.getHistory()[99].stdout).toBe('100th');

      shell.destroy();
      session.disconnect();
    }, 180000);
  });

  describe('History Immutability', () => {
    it('modifying returned array does not affect internal history', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "original"');

      const history1 = shell.getHistory();
      history1.push({ timestamp: '', command: 'fake', stdout: 'fake', exitCode: 0, durationMs: 0 });
      history1[0].stdout = 'modified';

      const history2 = shell.getHistory();
      expect(history2).toHaveLength(1);
      expect(history2[0].stdout).toBe('original');

      shell.destroy();
      session.disconnect();
    });

    it('multiple getHistory calls return consistent results', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "consistent"');

      const h1 = shell.getHistory();
      const h2 = shell.getHistory();
      const h3 = shell.getHistory(1);

      expect(h1).toEqual(h2);
      expect(h3).toEqual(h1);

      shell.destroy();
      session.disconnect();
    });
  });
});
