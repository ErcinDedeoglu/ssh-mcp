import * as net from 'node:net';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  isDockerRunning,
  createTestContext,
  SessionKeeper,
  type TestContext,
} from './ssh.setup.js';
import { createLocalForward, type LocalForwardConfig } from '../../../src/ssh/local-forward.js';
import { ForwardRegistry } from '../../../src/ssh/forward-registry.js';

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
  createLocalForward,
  ForwardRegistry,
  type TestContext,
  type LocalForwardConfig,
};

export function createPortForwardTestSetup(): {
  getCtx: () => TestContext;
  getRegistry: () => ForwardRegistry;
  setup: () => void;
  teardown: () => void;
  cleanupAfterEach: () => void;
} {
  let ctx: TestContext;
  let forwardRegistry: ForwardRegistry;

  return {
    getCtx: () => ctx,
    getRegistry: () => forwardRegistry,
    setup: () => {
      ctx = createTestContext();
      forwardRegistry = new ForwardRegistry();
    },
    teardown: () => {
      forwardRegistry.clear();
      ctx.pool.clear();
    },
    cleanupAfterEach: () => {
      forwardRegistry.clear();
    },
  };
}

export async function testTcpConnection(
  host: string,
  port: number,
  timeoutMs = 5000,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function readSshBannerFromPort(
  host: string,
  port: number,
  timeoutMs = 5000,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      let data = '';
      socket.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\n')) {
          socket.destroy();
          resolve(data.trim());
        }
      });
    });
    socket.on('error', reject);
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error('Timeout'));
    });
  });
}
