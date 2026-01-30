/**
 * Shared test utilities for SSH E2E tests.
 * Provides types, helpers, and test context factory.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { SessionKeeper } from '../../../src/ssh/session.js';
import { FileTransfer } from '../../../src/ssh/sftp.js';
import { ConnectionPool } from '../../../src/ssh/pool.js';
import type { ServerConfig } from '../../../src/config/types.js';
import type { Client } from 'ssh2';

export { SessionKeeper, FileTransfer, ConnectionPool };
export type { ServerConfig };
export { MAX_FILE_SIZE } from '../../../src/ssh/sftp.js';
export type { PasswordAuth, PrivateKeyAuth } from '../../../src/config/types.js';

export interface TestConfig {
  servers: ServerConfig[];
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

export function loadTestConfig(): TestConfig {
  const content = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
  return JSON.parse(content) as TestConfig;
}

export function isDockerRunning(): boolean {
  try {
    const result = execSync('docker compose -f docker-compose.test.yml ps --format json', {
      cwd: path.join(import.meta.dirname, '../../..'),
      encoding: 'utf-8',
    });
    const containers = result.trim().split('\n').filter(Boolean);
    return containers.length >= 3;
  } catch {
    return false;
  }
}

export function executeCommand(client: Client, command: string): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on('close', (code: number) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      stream.on('error', (streamErr: Error) => {
        reject(streamErr);
      });
    });
  });
}

export interface TestContext {
  config: TestConfig;
  pool: ConnectionPool;
  server1Config: ServerConfig;
  server2Config: ServerConfig;
  serverKeyConfig: ServerConfig;
  serverKeyPassphraseConfig: ServerConfig;
}

export function createTestContext(): TestContext {
  const config = loadTestConfig();
  return {
    config,
    pool: new ConnectionPool(),
    server1Config: config.servers[0],
    server2Config: config.servers[1],
    serverKeyConfig: config.servers[3],
    serverKeyPassphraseConfig: config.servers[4],
  };
}
