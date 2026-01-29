import { vi } from 'vitest';
import type { Config, ServerConfig, PasswordAuth } from '../../../../src/config/types.js';
import { ConnectionPool } from '../../../../src/ssh/pool.js';
import { ForwardRegistry } from '../../../../src/ssh/forward-registry.js';

export function createServerConfig(): ServerConfig {
  return {
    id: 'test-server',
    host: '192.168.1.100',
    port: 22,
    username: 'ubuntu',
    auth: { password: 'secret123' } as PasswordAuth,
    description: 'Test server',
    timeouts: {
      command: 30,
    },
  };
}

export function createConfig(serverConfig: ServerConfig): Config {
  return {
    servers: [serverConfig],
    defaults: {
      timeouts: {
        command: 60,
        idle: 900,
      },
    },
  };
}

export interface TestContext {
  config: Config;
  pool: ConnectionPool;
  forwardRegistry: ForwardRegistry;
  serverConfig: ServerConfig;
}

export function createTestContext(): TestContext {
  vi.clearAllMocks();
  const serverConfig = createServerConfig();
  const config = createConfig(serverConfig);
  const pool = new ConnectionPool();
  const forwardRegistry = new ForwardRegistry();
  return { config, pool, forwardRegistry, serverConfig };
}

export { createMockServer, type MockServer } from './mock-server.js';
export type { ToolResult, ToolHandler, ErrorCallback, ExecCallback } from './types.js';
export { getMockClient, clearInstances, type MockClientType } from './mock-client.js';
