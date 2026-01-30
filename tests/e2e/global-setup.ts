import { execSync, type ExecSyncOptions } from 'node:child_process';
import * as path from 'node:path';
import type { TestProject } from 'vitest/node';
import type {} from './vitest.d.ts';

const PROJECT_ROOT = path.join(import.meta.dirname, '../..');
const COMPOSE_FILE = 'docker-compose.test.yml';

function getShardConfig() {
  const shardIndex = parseInt(process.env.TEST_SHARD_INDEX ?? '0', 10);
  const portBase = 2 + shardIndex;
  const projectName = `ssh-mcp-e2e-${shardIndex}`;

  return { shardIndex, portBase, projectName };
}

function execDocker(command: string, portBase: number, projectName: string): void {
  const env = { ...process.env, PORT_BASE: String(portBase) };
  const opts: ExecSyncOptions = { cwd: PROJECT_ROOT, env, stdio: 'inherit' };
  execSync(`docker compose -f ${COMPOSE_FILE} -p ${projectName} ${command}`, opts);
}

function waitForHealthy(projectName: string, timeoutMs = 60000): void {
  const start = Date.now();
  const checkInterval = 2000;

  while (Date.now() - start < timeoutMs) {
    try {
      const result = execSync(`docker compose -p ${projectName} ps --format json`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const lines = result.trim().split('\n').filter(Boolean);
      const containers = lines.map((line) => JSON.parse(line));

      const allHealthy =
        containers.length >= 3 &&
        containers.every(
          (c: { Health?: string; State?: string }) =>
            c.Health === 'healthy' || c.State === 'running',
        );

      if (allHealthy) return;
    } catch (_) {
      void _;
    }

    execSync(`sleep ${checkInterval / 1000}`);
  }

  throw new Error(`Timeout waiting for containers in project ${projectName}`);
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const { shardIndex, portBase, projectName } = getShardConfig();
  const skipDocker = process.env.SKIP_DOCKER_SETUP === '1';

  if (skipDocker) {
    console.log(
      `[Shard ${shardIndex}] Using pre-started Docker (ports ${portBase}222-${portBase}224)`,
    );
  } else {
    console.log(`[Shard ${shardIndex}] Starting Docker (ports ${portBase}222-${portBase}224)...`);
    execDocker('up -d', portBase, projectName);
    waitForHealthy(projectName);
    console.log(`[Shard ${shardIndex}] Docker ready.`);
  }

  project.provide('shardIndex', shardIndex);
  project.provide('portBase', portBase);
  project.provide('ports', {
    server1: portBase * 1000 + 222,
    server2: portBase * 1000 + 223,
    serverKey: portBase * 1000 + 224,
  });

  return async () => {
    if (!skipDocker) {
      console.log(`[Shard ${shardIndex}] Stopping Docker...`);
      execDocker('down -v --remove-orphans', portBase, projectName);
    }
  };
}
