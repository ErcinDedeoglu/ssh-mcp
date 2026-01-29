# tests/e2e/ssh/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

E2E test suite for SSH functionality. 63 tests across 8 test files + 1 shared setup module. Requires Docker.

## Structure

| File                               | Tests | Purpose                                                                              |
| ---------------------------------- | ----- | ------------------------------------------------------------------------------------ |
| `ssh.setup.ts`                     | -     | Shared utilities: loadTestConfig, isDockerRunning, executeCommand, createTestContext |
| `connection.e2e.test.ts`           | 9     | Connection establishment, key-based auth, pool management                            |
| `command-execution.e2e.test.ts`    | 10    | Command exec, concurrent commands, timeouts                                          |
| `file-transfer.e2e.test.ts`        | 8     | SFTP upload/download, size limits                                                    |
| `file-transfer-binary.e2e.test.ts` | 5     | Binary files, unicode filenames, special content                                     |
| `unicode-output.e2e.test.ts`       | 6     | Unicode in output, large output handling                                             |
| `session-lifecycle.e2e.test.ts`    | 8     | Keep-alive, idle timeout, auto-reconnection                                          |
| `concurrency-stress.e2e.test.ts`   | 8     | High concurrency, stress tests                                                       |
| `edge-cases.e2e.test.ts`           | 9     | Permission errors, long commands, edge cases                                         |

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

| Config                          | Port | Auth             | User     |
| ------------------------------- | ---- | ---------------- | -------- |
| `ctx.server1Config`             | 2222 | password         | testuser |
| `ctx.server2Config`             | 2223 | password         | admin    |
| `ctx.serverKeyConfig`           | 2224 | private key      | keyuser  |
| `ctx.serverKeyPassphraseConfig` | 2224 | key + passphrase | keyuser  |

## Running Tests

```bash
npm run test:e2e          # Auto-manages Docker (recommended)
npm run test:e2e:up       # Start Docker containers only
npm run test:e2e:run      # Run tests (assumes Docker running)
npm run test:e2e:down     # Stop Docker containers
```

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
