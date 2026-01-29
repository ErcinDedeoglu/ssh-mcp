import * as net from 'node:net';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  executeCommand,
  type TestContext,
} from './ssh.setup.js';
import { createRemoteForward, type RemoteForwardConfig } from '../../../src/ssh/remote-forward.js';
import { RemoteForwardRegistry } from '../../../src/ssh/remote-forward-registry.js';

export {
  net,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  executeCommand,
  createRemoteForward,
  RemoteForwardRegistry,
  type TestContext,
  type RemoteForwardConfig,
};

export function createRemoteForwardTestSetup(): {
  getCtx: () => TestContext;
  getRegistry: () => RemoteForwardRegistry;
  setup: () => void;
  teardown: () => void;
  cleanupAfterEach: () => void;
} {
  let ctx: TestContext;
  let remoteForwardRegistry: RemoteForwardRegistry;

  return {
    getCtx: () => ctx,
    getRegistry: () => remoteForwardRegistry,
    setup: () => {
      ctx = createTestContext();
      remoteForwardRegistry = new RemoteForwardRegistry();
    },
    teardown: () => {
      remoteForwardRegistry.clear();
      ctx.pool.clear();
    },
    cleanupAfterEach: () => {
      remoteForwardRegistry.clear();
    },
  };
}

export function createLocalTcpServer(
  onConnection: (data: string, respond: (response: string) => void) => void,
): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
      });
      socket.on('end', () => {
        onConnection(buffer, (response: string) => {
          socket.write(response);
          socket.end();
        });
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    server.on('error', reject);
  });
}
