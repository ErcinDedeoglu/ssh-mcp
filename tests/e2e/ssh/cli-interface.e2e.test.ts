import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isDockerRunning, getShardConfigPath } from './ssh.setup.js';
import { runCli, parseJson } from './cli.helpers.js';

describe.skipIf(!isDockerRunning())('CLI interface (dual-mode binary)', () => {
  let originalConfigEnv: string | undefined;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = getShardConfigPath();
  });

  afterAll(() => {
    if (originalConfigEnv !== undefined) {
      process.env.SSH_MCP_CONFIG = originalConfigEnv;
    } else {
      delete process.env.SSH_MCP_CONFIG;
    }
  });

  it('lists servers in JSON mode', async () => {
    const result = await runCli(['servers', '--json']);
    expect(result.code).toBe(0);

    const servers = parseJson<Array<{ id: string }>>(result.stdout);
    const ids = servers.map((s) => s.id);
    expect(ids).toContain('test-server-1');
    expect(ids).toContain('test-server-2');
  });

  it('lists servers in human mode', async () => {
    const result = await runCli(['servers']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('test-server-1');
  });

  it('executes a command and prints stdout', async () => {
    const result = await runCli(['exec', 'test-server-1', 'echo', 'hello-cli']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('hello-cli');
  });

  it('propagates the remote exit code', async () => {
    const result = await runCli(['exec', 'test-server-1', 'sh -c "exit 7"']);
    expect(result.code).toBe(7);
  });

  it('returns structured JSON with --json', async () => {
    const result = await runCli(['exec', 'test-server-1', 'echo', 'json-mode', '--json']);
    expect(result.code).toBe(0);

    const payload = parseJson<{ stdout: string; exitCode: number }>(result.stdout);
    expect(payload.stdout.trim()).toBe('json-mode');
    expect(payload.exitCode).toBe(0);
  });

  it('reports unknown servers with exit code 1 and structured error', async () => {
    const result = await runCli(['exec', 'no-such-server', 'true']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('server_not_found');
  });

  it('checks connection status', async () => {
    const result = await runCli(['status', 'test-server-1', '--json']);
    expect(result.code).toBe(0);

    const status = parseJson<{ serverId: string; connected: boolean }>(result.stdout);
    expect(status.serverId).toBe('test-server-1');
    expect(status.connected).toBe(true);
  });
});
