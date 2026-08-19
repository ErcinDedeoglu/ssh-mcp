/**
 * Shared helpers for CLI e2e tests: spawn the real binary and parse results.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getShardConfigPath } from './ssh.setup.js';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function cliEntry(): string {
  if (!fs.existsSync(path.resolve('dist/index.js'))) {
    execFileSync('bun', ['run', 'build'], { stdio: 'inherit' });
  }
  return path.resolve('dist/index.js');
}

export function runCli(args: string[], timeoutMs = 60000): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry(), ...args], {
      env: { ...process.env, SSH_MCP_CONFIG: getShardConfigPath() },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI timed out after ${timeoutMs}ms: ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Spawns a long-running CLI process (e.g. foreground forward). */
export function spawnCli(args: string[]): ChildProcess {
  return spawn(process.execPath, [cliEntry(), ...args], {
    env: { ...process.env, SSH_MCP_CONFIG: getShardConfigPath() },
  });
}

export function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout) as T;
}

/** Polls an async predicate until truthy or the deadline passes. */
export async function waitFor<T>(
  fn: () => Promise<T> | T,
  { timeoutMs = 30000, intervalMs = 500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met before timeout');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Probes a local TCP port. */
export function probePort(port: number, host = '127.0.0.1', timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    void timeoutMs;
  });
}
