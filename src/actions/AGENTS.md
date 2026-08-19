<!-- Generated: 2026-08-19 | Branch: v1.0 -->

# src/actions/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

Shared business logic layer consumed by BOTH frontends (MCP tools in `src/tools/` and CLI commands in `src/cli/`). Each action is a pure-ish async function: typed input → `ActionOutcome`, with dependencies injected via `ActionDeps`. **No MCP SDK imports here.**

## Structure

| File                   | Action                                            | Wraps                                     |
| ---------------------- | ------------------------------------------------- | ----------------------------------------- |
| `types.ts`             | `ActionDeps`, `ActionOutcome`, `failureFrom()`    | -                                         |
| `ensure-connected.ts`  | `ensureConnected()`, `refreshConfig()`            | SessionKeeper, pool                       |
| `shell-helpers.ts`     | `getOrCreateShell()`, timeout resolvers           | ShellSession, persistShellType            |
| `list-servers.ts`      | `listServers()`                                   | config + pool                             |
| `execute.ts`           | `executeCommand()`                                | ShellSession                              |
| `execute-background.ts`| `executeBackground()` (in-memory registry jobs)   | ShellSession + JobRegistry                |
| `check-job.ts`         | `checkJob()` - registry first, then JobStore      | JobRegistry / JobStore                    |
| `cancel-job.ts`        | `cancelJob()` - in-process SIGINT or stored SIGTERM | JobRegistry / JobStore                  |
| `upload.ts`            | `uploadFile()`                                    | FileTransfer                              |
| `download.ts`          | `downloadFile()`                                  | FileTransfer                              |
| `connection-status.ts` | `connectionStatus()`, `formatDuration()`          | healthCheck + ping                        |
| `forward-port.ts`      | `forwardPort()`                                   | createLocalForward                        |
| `close-forward.ts`     | `closeForward()`                                  | ForwardRegistry                           |
| `list-forwards.ts`     | `listForwards()` (in-process only)                | both forward registries                   |
| `forward-remote-port.ts` | `forwardRemotePort()`                           | createRemoteForward                       |
| `close-remote-forward.ts` | `closeRemoteForwardAction()`                   | closeRemoteForward + registry             |
| `jump-connect.ts`      | `jumpConnect()`                                   | createJumpStream + SessionKeeper          |
| `disconnect.ts`        | `disconnectServer()`                              | pool + shellRegistry                      |
| `get-console-history.ts` | `getConsoleHistory()`                           | ShellRegistry                             |

## Result Contract

```typescript
type ActionOutcome<T> =
  | { ok: true; data: T; pretty?: boolean }        // MCP: JSON.stringify(data [, null, 2] if pretty)
  | { ok: false; message: string; json?: object }; // MCP: JSON.stringify(json) if set, else message
```

- Failures with `json` preserve the structured payloads some MCP tools historically returned (e.g. `server_not_found`).
- Actions catch their own exceptions via `failureFrom()` (applies `sanitizeError`) - frontends never need try/catch.

## Conventions

- `ActionDeps` carries all registries; `jobStore` is optional (CLI only, MCP is registry-only).
- Tools that don't receive every registry use `partialDeps()` (`src/tools/deps.ts`) - missing fields become empty instances, safe because each tool's action only touches what it historically received.
- Response payloads are **byte-identical** to the pre-refactor MCP tools; e2e tests assert on them - do not "clean up" field names here without updating tests.
- Keep actions MCP-agnostic: no `McpServer`, no zod schemas, no process.argv.

## Where to Look

| Task                                  | Location                              |
| ------------------------------------- | ------------------------------------- |
| Change command timeout resolution     | `shell-helpers.ts` resolveTimeoutMs() |
| Change shell reuse/recreation logic   | `shell-helpers.ts` getOrCreateShell() |
| Add new shared capability             | new action file + register in `index.ts` |
| Change job lookup (memory vs disk)    | `check-job.ts` resolveJob()           |
