import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isDockerRunning, getShardConfigPath } from './ssh.setup.js';
import { runCli, spawnCli, parseJson, waitFor, probePort } from './cli.helpers.js';

const SERVER = 'test-server-1';

describe.skipIf(!isDockerRunning())('CLI lifecycle (jobs, transfers, forwards)', () => {
  let originalConfigEnv: string | undefined;
  let tmpDir: string;

  beforeAll(() => {
    originalConfigEnv = process.env.SSH_MCP_CONFIG;
    process.env.SSH_MCP_CONFIG = getShardConfigPath();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-mcp-cli-e2e-'));
  });

  afterAll(() => {
    if (originalConfigEnv !== undefined) process.env.SSH_MCP_CONFIG = originalConfigEnv;
    else delete process.env.SSH_MCP_CONFIG;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('upload / download roundtrip', () => {
    it('uploads a local file and downloads it back intact', async () => {
      const content = `cli-transfer-e2e ${Date.now()}\n`;
      const localFile = path.join(tmpDir, 'up.txt');
      const downFile = path.join(tmpDir, 'down.txt');
      const remoteFile = `/tmp/cli-e2e-${Date.now()}.txt`;
      fs.writeFileSync(localFile, content);

      const up = await runCli(['upload', SERVER, localFile, remoteFile]);
      expect(up.code).toBe(0);

      const down = await runCli(['download', SERVER, remoteFile, downFile]);
      expect(down.code).toBe(0);
      expect(fs.readFileSync(downFile, 'utf-8')).toBe(content);

      // cleanup remote via the CLI itself
      await runCli(['exec', SERVER, `rm -f ${remoteFile}`]);
    });

    it('reports download failure for missing remote files', async () => {
      const result = await runCli([
        'download',
        SERVER,
        `/tmp/definitely-missing-${Date.now()}`,
        path.join(tmpDir, 'nope.txt'),
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('background jobs', () => {
    it('runs exec --bg to completion with streamed output', async () => {
      const start = await runCli([
        'exec',
        SERVER,
        'for i in 1 2 3; do echo "tick $i"; sleep 1; done',
        '--bg',
        '--stall-timeout',
        '0',
        '--json',
      ]);
      expect(start.code).toBe(0);

      const { jobId } = parseJson<{ jobId: string }>(start.stdout);
      expect(jobId).toMatch(/^job_/);

      const job = (await waitFor(
        async () => {
          const check = await runCli(['job', 'check', jobId, '--json']);
          expect(check.code).toBe(0);
          const payload = parseJson<{
            status: string;
            partialOutput?: string;
            result?: { stdout: string };
          }>(check.stdout);
          return payload.status === 'completed' ? payload : null;
        },
        { timeoutMs: 45000 },
      )) as { status: string; partialOutput?: string; result?: { stdout: string } };

      const out = job.result?.stdout ?? job.partialOutput ?? '';
      expect(out).toContain('tick 1');
      expect(out).toContain('tick 3');
    });

    it('lists the job with its terminal status', async () => {
      const list = await runCli(['job', 'list', SERVER, '--json']);
      expect(list.code).toBe(0);

      const jobs = parseJson<Array<{ jobId: string; status: string }>>(list.stdout);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0]).toHaveProperty('status');
    });

    it('cancels a running job', async () => {
      const start = await runCli([
        'exec',
        SERVER,
        'sleep 120',
        '--bg',
        '--stall-timeout',
        '0',
        '--json',
      ]);
      const { jobId } = parseJson<{ jobId: string }>(start.stdout);

      await waitFor(
        async () => {
          const check = await runCli(['job', 'check', jobId, '--json']);
          return parseJson<{ status: string }>(check.stdout).status === 'running';
        },
        { timeoutMs: 20000 },
      );

      const cancel = await runCli(['job', 'cancel', jobId, '--json']);
      expect(cancel.code).toBe(0);
      expect(parseJson<{ status: string }>(cancel.stdout).status).toBe('cancelled');

      const check = await runCli(['job', 'check', jobId, '--json']);
      expect(parseJson<{ status: string }>(check.stdout).status).toBe('cancelled');
    });
  });

  describe('jump', () => {
    it('runs a command on the target through the bastion', async () => {
      const result = await runCli([
        'jump',
        SERVER,
        'jump-target-internal',
        'echo',
        'via-jump',
        '--json',
      ]);

      expect(result.code).toBe(0);
      const payload = parseJson<{ stdout: string; exitCode: number }>(result.stdout);
      expect(payload.stdout.trim()).toBe('via-jump');
      expect(payload.exitCode).toBe(0);
    });
  });

  describe('foreground forward', () => {
    it('tunnels a local port until forward-close stops it', async () => {
      const localPort = 24000 + (process.pid % 1000);
      const child = spawnCli([
        'forward',
        SERVER,
        'localhost',
        '22',
        '--local-port',
        String(localPort),
      ]);

      let stderr = '';
      child.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));

      await waitFor(() => stderr.includes('->'), { timeoutMs: 20000 });
      await waitFor(() => probePort(localPort), { timeoutMs: 10000 });

      const list = await runCli(['forwards', '--json']);
      const entries = parseJson<Array<{ localPort: number; serverId: string }>>(list.stdout);
      expect(entries.some((e) => e.localPort === localPort && e.serverId === SERVER)).toBe(true);

      const close = await runCli(['forward-close', String(localPort)]);
      expect(close.code).toBe(0);

      const exitCode = await new Promise<number>((resolve) =>
        child.on('exit', (c) => resolve(c ?? -1)),
      );
      expect(exitCode).toBe(0);

      await waitFor(async () => !(await probePort(localPort)), { timeoutMs: 10000 });
      const after = await runCli(['forwards', '--json']);
      const entriesAfter = parseJson<Array<{ localPort: number }>>(after.stdout);
      expect(entriesAfter.some((e) => e.localPort === localPort)).toBe(false);
    }, 90000);
  });
});
