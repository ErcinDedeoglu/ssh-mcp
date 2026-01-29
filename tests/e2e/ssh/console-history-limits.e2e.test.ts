import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';
import {
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_OUTPUT_LENGTH,
} from '../../../src/ssh/shell-session.types.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Limits', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('Output Truncation (50KB limit)', () => {
    it('stores full output when under limit', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 30000, stallTimeoutMs: 15000 });
      await shell.initialize(session.client);

      // Generate 10KB of output (under 50KB limit)
      await shell.execute('head -c 10240 /dev/zero | tr "\\0" "A"');
      const entry = shell.getHistory()[0];

      expect(entry.stdout.length).toBe(10240);
      expect(entry.stdout).not.toContain('truncated');

      shell.destroy();
      session.disconnect();
    });

    it('truncates output exceeding 50KB', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      // Generate 60KB of output (over 50KB limit)
      const sizeBytes = 60 * 1024;
      await shell.execute(`head -c ${sizeBytes} /dev/zero | tr "\\0" "X"`);
      const entry = shell.getHistory()[0];

      expect(entry.stdout.length).toBeLessThan(sizeBytes);
      expect(entry.stdout.length).toBeGreaterThanOrEqual(MAX_HISTORY_OUTPUT_LENGTH);
      expect(entry.stdout).toContain('... (truncated)');

      shell.destroy();
      session.disconnect();
    });

    it('truncates at exactly 50KB boundary', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      // Generate exactly 51KB
      const sizeBytes = 51 * 1024;
      await shell.execute(`head -c ${sizeBytes} /dev/zero | tr "\\0" "Y"`);
      const entry = shell.getHistory()[0];

      // Should have 50KB + truncation marker
      const expectedMaxLength = MAX_HISTORY_OUTPUT_LENGTH + '\n... (truncated)'.length;
      expect(entry.stdout.length).toBeLessThanOrEqual(expectedMaxLength);
      expect(entry.stdout).toContain('... (truncated)');

      shell.destroy();
      session.disconnect();
    });

    it('original command output unaffected by history truncation', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      // Generate 60KB - result should be full, history truncated
      const sizeBytes = 60 * 1024;
      const result = await shell.execute(`head -c ${sizeBytes} /dev/zero | tr "\\0" "Z"`);

      // Command result is NOT truncated
      expect(result.stdout.length).toBe(sizeBytes);

      // History IS truncated
      const entry = shell.getHistory()[0];
      expect(entry.stdout.length).toBeLessThan(sizeBytes);

      shell.destroy();
      session.disconnect();
    });
  });

  describe('Entry Count Cap (100 entries)', () => {
    it('stores up to 100 entries', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      // Execute exactly 100 commands
      for (let i = 0; i < 100; i++) {
        await shell.execute(`echo "${i}"`);
      }

      const history = shell.getHistory();
      expect(history).toHaveLength(100);
      expect(history[0].stdout).toBe('0');
      expect(history[99].stdout).toBe('99');

      shell.destroy();
      session.disconnect();
    }, 120000);

    it('evicts oldest entries when exceeding 100', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      // Execute 105 commands
      for (let i = 0; i < 105; i++) {
        await shell.execute(`echo "entry_${i}"`);
      }

      const history = shell.getHistory();
      expect(history).toHaveLength(MAX_HISTORY_ENTRIES); // 100

      // Oldest 5 should be evicted (0-4), first should be entry_5
      expect(history[0].stdout).toBe('entry_5');
      expect(history[99].stdout).toBe('entry_104');

      shell.destroy();
      session.disconnect();
    }, 120000);

    it('correctly maintains order after eviction', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 60000, stallTimeoutMs: 30000 });
      await shell.initialize(session.client);

      // Fill to 100
      for (let i = 0; i < 100; i++) {
        await shell.execute(`echo "batch1_${i}"`);
      }

      // Add 10 more (should evict first 10)
      for (let i = 0; i < 10; i++) {
        await shell.execute(`echo "batch2_${i}"`);
      }

      const history = shell.getHistory();
      expect(history).toHaveLength(100);

      // First entry should be batch1_10 (not batch1_0)
      expect(history[0].stdout).toBe('batch1_10');
      // Last entry should be batch2_9
      expect(history[99].stdout).toBe('batch2_9');

      shell.destroy();
      session.disconnect();
    }, 120000);
  });

  describe('Constants Verification', () => {
    it('MAX_HISTORY_ENTRIES is 100', () => {
      expect(MAX_HISTORY_ENTRIES).toBe(100);
    });

    it('MAX_HISTORY_OUTPUT_LENGTH is 50KB', () => {
      expect(MAX_HISTORY_OUTPUT_LENGTH).toBe(50 * 1024);
    });
  });
});
