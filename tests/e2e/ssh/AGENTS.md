# tests/e2e/ssh/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

E2E test suite for SSH functionality. Requires Docker. ~40 test files + setup modules.

## Structure

| File                               | Purpose                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `../global-setup.ts`               | Vitest globalSetup: Docker lifecycle per shard, port injection                       |
| `../vitest.d.ts`                   | TypeScript types for Vitest provide/inject (ProvidedContext)                         |
| `ssh.setup.ts`                     | Shared utilities: loadTestConfig, isDockerRunning, executeCommand, createTestContext |
| `port-forward.setup.ts`            | Port forwarding test setup and TCP helpers                                           |
| `remote-forward.setup.ts`          | Remote forwarding test setup and local TCP server                                    |
| `connection.e2e.test.ts`           | Connection establishment, key-based auth, pool management                            |
| `command-execution.e2e.test.ts`    | Command exec, concurrent commands, timeouts                                          |
| `file-transfer.e2e.test.ts`        | SFTP upload/download, size limits                                                    |
| `file-transfer-binary.e2e.test.ts` | Binary files, unicode filenames, special content                                     |
| `unicode-output.e2e.test.ts`       | Unicode in output, large output handling                                             |
| `session-lifecycle.e2e.test.ts`    | Keep-alive, idle timeout, auto-reconnection                                          |
| `concurrency-stress.e2e.test.ts`   | High concurrency, stress tests                                                       |
| `edge-cases.e2e.test.ts`           | Permission errors, long commands, edge cases                                         |
| `port-forward*.e2e.test.ts`        | Local port forwarding tests                                                          |
| `remote-forward*.e2e.test.ts`      | Remote port forwarding tests                                                         |
| `jump-connect*.e2e.test.ts`        | Jump host / bastion connection tests                                                 |
| `shell-session*.e2e.test.ts`       | Persistent shell session tests                                                       |
| `console-history*.e2e.test.ts`     | Command history retrieval tests                                                      |

## Test Context Pattern

```typescript
import { createTestContext, isDockerRunning, executeCommand, SessionKeeper } from './ssh.setup.js';

describe.skipIf(!isDockerRunning())('E2E Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });
  afterAll(() => {
    ctx.pool.clear();
  });

  it('test case', async () => {
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();
    const result = await executeCommand(session.client, 'echo hello');
    expect(result.stdout.trim()).toBe('hello');
    session.disconnect();
  });
});
```

## Available Test Servers

Ports are dynamic based on shard index (shown for shard 0):

| Config                          | Port (shard 0) | Auth             | User     |
| ------------------------------- | -------------- | ---------------- | -------- |
| `ctx.server1Config`             | 2222           | password         | testuser |
| `ctx.server2Config`             | 2223           | password         | admin    |
| `ctx.serverKeyConfig`           | 2224           | private key      | keyuser  |
| `ctx.serverKeyPassphraseConfig` | 2224           | key + passphrase | keyuser  |

Ports are calculated via `getShardPorts()` in `ssh.setup.ts`.

## Running Tests

```bash
bun run test:e2e              # Parallel with 8 shards (default)
bun run test:e2e:sequential   # Single shard for debugging
SHARDS=4 bun run test:e2e     # Custom shard count
bun run test:e2e:up           # Start Docker containers only
bun run test:e2e:run          # Run tests (assumes Docker running)
bun run test:e2e:down         # Stop Docker containers
```

### Parallel Execution Architecture

Parallel E2E tests use isolated Docker environments per shard:

```
┌─────────────────────────────────────────────────────────┐
│              run-e2e-parallel.sh                         │
├─────────────────────────────────────────────────────────┤
│ 1. Start N Docker envs (ssh-mcp-e2e-0, ssh-mcp-e2e-1)   │
│ 2. Wait for all containers healthy                      │
│ 3. Run N vitest processes in parallel                   │
│ 4. Cleanup all Docker envs                              │
└─────────────────────────────────────────────────────────┘
```

Port allocation per shard:

| Shard | ssh-server-1 | ssh-server-2 | ssh-server-key |
| ----- | ------------ | ------------ | -------------- |
| 0     | 2222         | 2223         | 2224           |
| 1     | 3222         | 3223         | 3224           |

Formula: `(2 + shardIndex) * 1000 + offset` where offset is 222, 223, or 224.

## Adding New Tests

1. Choose appropriate test file by domain
2. Import from `./ssh.setup.js`
3. Use `describe.skipIf(!isDockerRunning())` wrapper
4. Use `createTestContext()` in beforeAll
5. Call `ctx.pool.clear()` in afterAll
6. Use `{ maxReconnectAttempts: 0 }` to disable reconnection in tests

## Conventions

**No reconnection in tests**: Pass `{ maxReconnectAttempts: 0 }` to prevent flaky tests.

**Always disconnect**: Call `session.disconnect()` at end of each test.

**Use executeCommand helper**: Handles stream collection and exit code.

**Check isDockerRunning**: All E2E tests skip automatically if Docker unavailable.

**Parallel sharding**: Tests can run in parallel across multiple shards via `bun run test:e2e`. Within a shard, tests run sequentially (`fileParallelism: false`).

**Use `remotePort: 0` for remote forwards**: Always use OS auto-assigned ports in tests to avoid port collisions across parallel shards.
