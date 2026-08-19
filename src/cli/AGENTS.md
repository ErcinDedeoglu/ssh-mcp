<!-- Generated: 2026-08-19 | Branch: v1.0 -->

# src/cli/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

Commander-based CLI. One-shot per invocation (no daemon): each command builds `ActionDeps` via `buildCliDeps()`, calls the shared action, prints the result, then `cleanupCli()` disconnects. Every command honors global `--json`.

## Structure

| File              | Purpose                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `main.ts`         | `runCli(argv)`: commander program, all commands, hidden `run-job` |
| `context.ts`      | `buildCliDeps()` / `cleanupCli()`                                  |
| `output.ts`       | `report()`: prints ActionOutcome, returns exit code                |
| `job-launch.ts`   | `launchBackgroundJob()`: spawns detached runner child              |
| `job-runner.ts`   | `runJob()`: the runner child - executes, streams to JobStore       |
| `forward-store.ts`| CLI forward tracking (`<config-dir>/forwards.json`, pid liveness)  |
| `commands/`       | One file per command family (exec, job, transfer, connection, forward) |

## Command Map

| Command                                       | Action                              | Notes                                       |
| --------------------------------------------- | ----------------------------------- | ------------------------------------------- |
| `servers`                                     | listServers                         | human table or `--json`                     |
| `exec <id> <cmd...> [--bg]`                   | executeCommand / launchBackgroundJob| exit code = remote exit code; `--stdin`     |
| `job list/check/cancel`                       | checkJob / cancelJob                | reads JobStore (disk)                       |
| `upload` / `download`                         | uploadFile / downloadFile           |                                             |
| `status <id>`                                 | connectionStatus                    | auto-connects                               |
| `jump <jump> <target> [cmd...]`               | jumpConnect (+ executeCommand)      | verify-only when no command                 |
| `forward` / `rforward`                        | forwardPort / forwardRemotePort     | foreground until SIGINT; `--via <jumpId>`   |
| `forwards` / `forward-close` / `rforward-close`| ForwardStore (pid signaling)       | CLI-owned forwards only                     |

## Process Model

- **Foreground forwards**: run until Ctrl-C/SIGTERM, then remove their ForwardStore entry and disconnect. Other invocations see them via `forwards` (pid liveness); `forward-close` signals the owner PID.
- **Background jobs**: `exec --bg` writes a `pending` meta immediately, spawns detached `node dist/index.js run-job <jobId> <serverId> [--config p] -- <command>`, which flips it to `running` (with pid), streams output to `<jobsDir>/<id>.output`, and writes terminal state. `job cancel` SIGTERMs the runner (runner marks itself cancelled; canceller also writes disk state defensively).
- State lives under `<config-dir>/jobs/` + `<config-dir>/forwards.json` (next to the config file, so `SSH_MCP_CONFIG`/`--config` scopes them).

## Conventions

- Human output on stdout, diagnostics/errors on stderr; `--json` prints the action payload only.
- `exec` joins args with spaces (like `ssh`) - quote as one string for shell operators.
- MCP-only tools without CLI equivalents: `disconnect` (session-scoped), `get_console_history` (per-process shell).
- No commander in actions; parse here, pass typed input down.
