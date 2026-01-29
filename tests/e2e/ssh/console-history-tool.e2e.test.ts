import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';
import { ShellRegistry } from '../../../src/ssh/shell-registry.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Tool Integration', () => {
  let ctx: TestContext;
  let registry: ShellRegistry;

  beforeAll(() => {
    ctx = createTestContext();
    registry = new ShellRegistry();
  });

  afterAll(() => {
    registry.clear();
    ctx.pool.clear();
  });

  describe('get_console_history Tool Behavior', () => {
    it('returns empty history for new shell', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);
      registry.set('new-server', shell);

      const retrievedShell = registry.get('new-server');
      const history = retrievedShell?.getHistory() ?? [];

      expect(history).toHaveLength(0);

      registry.remove('new-server');
      session.disconnect();
    });

    it('returns history with correct structure', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);
      registry.set('struct-server', shell);

      await shell.execute('echo "test output"');

      const retrievedShell = registry.get('struct-server');
      const history = retrievedShell?.getHistory() ?? [];

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        command: 'echo "test output"',
        stdout: 'test output',
        exitCode: 0,
      });
      expect(typeof history[0].timestamp).toBe('string');
      expect(typeof history[0].durationMs).toBe('number');

      registry.remove('struct-server');
      session.disconnect();
    });

    it('returns undefined for non-existent server', () => {
      const shell = registry.get('non-existent-server-xyz');
      expect(shell).toBeUndefined();
    });

    it('limit parameter works via getHistory', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);
      registry.set('limit-server', shell);

      for (let i = 0; i < 5; i++) {
        await shell.execute(`echo "entry_${i}"`);
      }

      const fullHistory = shell.getHistory();
      const limitedHistory = shell.getHistory(2);

      expect(fullHistory).toHaveLength(5);
      expect(limitedHistory).toHaveLength(2);
      expect(limitedHistory[0].stdout).toBe('entry_3');
      expect(limitedHistory[1].stdout).toBe('entry_4');

      registry.remove('limit-server');
      session.disconnect();
    });
  });

  describe('Tool Response Format', () => {
    it('history entries can be JSON serialized', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);
      registry.set('json-server', shell);

      await shell.execute('echo "serialize me"');

      const history = shell.getHistory();
      const serialized = JSON.stringify({
        serverId: 'json-server',
        count: history.length,
        history,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.serverId).toBe('json-server');
      expect(parsed.count).toBe(1);
      expect(parsed.history[0].stdout).toBe('serialize me');

      registry.remove('json-server');
      session.disconnect();
    });

    it('handles special characters in JSON serialization', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);
      registry.set('special-server', shell);

      await shell.execute('echo "line1\nline2\ttab"');

      const history = shell.getHistory();
      const serialized = JSON.stringify({ history });
      const parsed = JSON.parse(serialized);

      expect(parsed.history[0].stdout).toContain('line1');

      registry.remove('special-server');
      session.disconnect();
    });
  });

  describe('Multi-Server Scenarios', () => {
    it('retrieves correct history for specific server', async () => {
      const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      const session2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
      await Promise.all([session1.connect(), session2.connect()]);

      const shell1 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      const shell2 = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await Promise.all([shell1.initialize(session1.client), shell2.initialize(session2.client)]);

      registry.set('multi-server-1', shell1);
      registry.set('multi-server-2', shell2);

      await shell1.execute('echo "from server 1"');
      await shell2.execute('echo "from server 2"');
      await shell2.execute('echo "also server 2"');

      const history1 = registry.get('multi-server-1')?.getHistory() ?? [];
      const history2 = registry.get('multi-server-2')?.getHistory() ?? [];

      expect(history1).toHaveLength(1);
      expect(history2).toHaveLength(2);
      expect(history1[0].stdout).toBe('from server 1');
      expect(history2[0].stdout).toBe('from server 2');

      registry.remove('multi-server-1');
      registry.remove('multi-server-2');
      session1.disconnect();
      session2.disconnect();
    });
  });

  describe('Error Scenarios', () => {
    it('shell not ready returns no history', async () => {
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      const history = shell.getHistory();
      expect(history).toHaveLength(0);
    });

    it('destroyed shell returns empty history', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "before"');
      expect(shell.getHistory()).toHaveLength(1);

      shell.destroy();
      expect(shell.getHistory()).toHaveLength(0);

      session.disconnect();
    });
  });
});
