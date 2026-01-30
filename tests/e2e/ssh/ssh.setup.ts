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

import type { Config } from '../../../src/config/types.js';

export type { Config };

export interface TestConfig {
  servers: ServerConfig[];
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const TEST_CONFIG_PATH = path.join(import.meta.dirname, '..', 'config.test.json');

export function getShardPorts(): { server1: number; server2: number; serverKey: number } {
  const shardIndex = parseInt(process.env.TEST_SHARD_INDEX ?? '0', 10);
  const portBase = 2 + shardIndex;
  return {
    server1: portBase * 1000 + 222,
    server2: portBase * 1000 + 223,
    serverKey: portBase * 1000 + 224,
  };
}

export function loadTestConfig(): TestConfig {
  const content = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
  const config = JSON.parse(content) as TestConfig;

  const ports = getShardPorts();
  config.servers[0].port = ports.server1;
  config.servers[1].port = ports.server2;
  config.servers[3].port = ports.serverKey;
  config.servers[4].port = ports.serverKey;

  return config;
}

export function loadTestConfigFull(): Config {
  const content = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
  const config = JSON.parse(content) as Config;

  const ports = getShardPorts();
  config.servers[0].port = ports.server1;
  config.servers[1].port = ports.server2;
  config.servers[3].port = ports.serverKey;
  config.servers[4].port = ports.serverKey;

  return config;
}

let shardConfigPath: string | null = null;

export function getShardConfigPath(): string {
  if (shardConfigPath) return shardConfigPath;

  const config = loadTestConfigFull();
  const tempDir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'ssh-mcp-test-'));
  shardConfigPath = path.join(tempDir, 'config.json');
  fs.writeFileSync(shardConfigPath, JSON.stringify(config, null, 2));
  fs.chmodSync(shardConfigPath, 0o600);

  return shardConfigPath;
}

export function isDockerRunning(): boolean {
  try {
    const shardIndex = parseInt(process.env.TEST_SHARD_INDEX ?? '0', 10);
    const projectName = `ssh-mcp-e2e-${shardIndex}`;
    const cmd = `docker compose -f docker-compose.test.yml -p ${projectName} ps --format json`;
    const result = execSync(cmd, {
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
