// Shared test fixtures and helpers for config loader tests.
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Config } from '../../../../src/config/types.js';

export interface ConfigTestContext {
  testDir: string;
  configDir: string;
  configPath: string;
  originalEnvConfig: string | undefined;
}

export function createTestContext(suffix = ''): ConfigTestContext {
  // Use random suffix for true isolation in parallel execution
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const testDir = path.join(os.tmpdir(), `ssh-mcp-test-${suffix}-${uniqueId}`);
  const configDir = path.join(testDir, '.ssh-mcp');
  const configPath = path.join(configDir, 'config.json');
  return { testDir, configDir, configPath, originalEnvConfig: undefined };
}

export function setupTestEnv(ctx: ConfigTestContext): void {
  // Use SSH_MCP_CONFIG env var instead of modifying HOME (which is global/shared)
  ctx.originalEnvConfig = process.env.SSH_MCP_CONFIG;
  process.env.SSH_MCP_CONFIG = ctx.configPath;
  fs.mkdirSync(ctx.configDir, { recursive: true });
}

export function teardownTestEnv(ctx: ConfigTestContext): void {
  if (ctx.originalEnvConfig !== undefined) {
    process.env.SSH_MCP_CONFIG = ctx.originalEnvConfig;
  } else {
    delete process.env.SSH_MCP_CONFIG;
  }
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
