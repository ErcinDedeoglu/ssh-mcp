// Shared test fixtures and helpers for config loader tests.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Config } from '../../../../src/config/types.js';

export interface ConfigTestContext {
  testDir: string;
  configDir: string;
  configPath: string;
  originalHome: string | undefined;
}

export function createTestContext(suffix = ''): ConfigTestContext {
  const testDir = path.join(os.tmpdir(), `ssh-mcp-test-${suffix}-${process.pid}`);
  const configDir = path.join(testDir, '.ssh-mcp');
  const configPath = path.join(configDir, 'config.json');
  return { testDir, configDir, configPath, originalHome: undefined };
}

export function setupTestEnv(ctx: ConfigTestContext): void {
  ctx.originalHome = process.env.HOME;
  process.env.HOME = ctx.testDir;
  fs.mkdirSync(ctx.configDir, { recursive: true });
}

export function teardownTestEnv(ctx: ConfigTestContext): void {
  process.env.HOME = ctx.originalHome;
  fs.rmSync(ctx.testDir, { recursive: true, force: true });
}

export function writeConfigFile(configPath: string, config: unknown, mode: number = 0o600): void {
  fs.writeFileSync(configPath, JSON.stringify(config));
  fs.chmodSync(configPath, mode);
}

export function createValidConfig(): Config {
  return {
    servers: [
      {
        id: 'test-server',
        host: '192.168.1.100',
        port: 22,
        username: 'ubuntu',
        auth: { privateKey: '/home/user/.ssh/id_rsa' },
      },
    ],
  };
}
