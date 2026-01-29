import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { ShellSession } from '../../../src/ssh/shell-session.js';

describe.skipIf(!isDockerRunning())('E2E Console History - Persistence', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(() => {
    ctx.pool.clear();
  });

  describe('History Persistence Within Session', () => {
    it('history accumulates across multiple command batches', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('echo "batch1"');
      expect(shell.getHistory()).toHaveLength(1);

      await shell.execute('echo "batch2"');
      expect(shell.getHistory()).toHaveLength(2);

      await shell.execute('echo "batch3"');
      expect(shell.getHistory()).toHaveLength(3);

      shell.destroy();
      session.disconnect();
    });

    it('history survives cwd changes', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /tmp');
      await shell.execute('pwd');
      await shell.execute('cd /');
      await shell.execute('pwd');

      const history = shell.getHistory();
      expect(history).toHaveLength(4);
      expect(history[1].stdout).toBe('/tmp');
      expect(history[3].stdout).toBe('/');

      shell.destroy();
      session.disconnect();
    });

    it('history survives env var changes', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('export FOO=bar');
      await shell.execute('echo $FOO');
      await shell.execute('export FOO=baz');
      await shell.execute('echo $FOO');

      const history = shell.getHistory();
      expect(history).toHaveLength(4);
      expect(history[1].stdout).toBe('bar');
      expect(history[3].stdout).toBe('baz');

      shell.destroy();
      session.disconnect();
    });

    it('history tracks shell state evolution', async () => {
      const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
      await session.connect();
      const shell = new ShellSession({ timeoutMs: 10000, stallTimeoutMs: 5000 });
      await shell.initialize(session.client);

      await shell.execute('cd /tmp');
      await shell.execute('export MYVAR=test');
      await shell.execute('pwd && echo $MYVAR');

      const history = shell.getHistory();
      expect(history).toHaveLength(3);
      expect(history[2].stdout).toContain('/tmp');
      expect(history[2].stdout).toContain('test');

      shell.destroy();
      session.disconnect();
    });
  });
});
