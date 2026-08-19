# src/ssh/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

SSH connection management: SessionKeeper (connection lifecycle), ConnectionPool (registry), FileTransfer (SFTP), ForwardRegistry (port forwarding), ShellSession (persistent shell).

## Structure

| File                           | Purpose                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `session.ts`                   | SessionKeeper: EventEmitter-based connection with auto-reconnect        |
| `session.types.ts`             | Types, constants, pure functions (calculateReconnectDelay, etc.)        |
| `session-connect-config.io.ts` | buildSshConnectConfig(): auth config builder for ssh2                   |
| `pool.ts`                      | ConnectionPool: Map registry with auto-removal on max-retries           |
| `sftp.ts`                      | FileTransfer: upload/download with 100MB limit, cross-platform ~ paths  |
| `shell-adapter.ts`             | ShellAdapter interface, createShellAdapter() factory, detectShellType() |
| `shell-adapter-posix.ts`       | PosixShellAdapter: bash/sh/zsh command wrapping and init                |
| `shell-adapter-powershell.ts`  | PowerShellAdapter: PowerShell command wrapping and init                 |
| `shell-adapter-cmd.ts`         | CmdShellAdapter: cmd.exe command wrapping and init                      |
| `shell-session.ts`             | ShellSession: persistent shell with marker-based command exec           |
| `shell-session.types.ts`       | Types, constants, marker generation, output parsing functions           |
| `shell-session.io.ts`          | Prompt waiting functions (waitForInitialPrompt, waitForMcpPrompt)       |
| `shell-session-writer.ts`      | writeCommand(): writes wrapped commands + optional stdin to stream      |
| `shell-session-history.ts`     | ShellHistory: command history tracking with truncation                  |
| `shell-session-timers.ts`      | Timer state management (timeout + stall timers)                         |
| `shell-registry.ts`            | ShellRegistry: Map of serverId → ShellSession                           |
| `job-registry.ts`              | JobRegistry: background job tracking for execute_background             |
| `job-store.ts`                 | JobStore: disk-backed job persistence for CLI background jobs           |
| `forward-registry.ts`          | ForwardRegistry: tracks active local port forwards                      |
| `local-forward.ts`             | createLocalForward(): net.Server + ssh2 forwardOut() wiring             |
| `remote-forward.ts`            | createRemoteForward(): ssh2 forwardIn() wiring                          |
| `remote-forward-registry.ts`   | RemoteForwardRegistry: tracks remote port forwards                      |
| `jump-stream.ts`               | createJumpStream(): nested SSH connections through bastion              |
| `connection.ts`                | **DEAD CODE** - never use, kept for reference only                      |

## SessionKeeper State Machine

```
DISCONNECTED → connect() → CONNECTED
                              ↓ (unexpected close)
                        RECONNECTING ←──┐
                              ↓         │
                        attemptReconnect()
                              ↓         │
                     success? ──YES→ CONNECTED
                              ↓
                             NO → attempt < max?
                                      ↓
                                YES → delay → ─┘
                                      ↓
                                 NO → max-retries-reached → DISCONNECTED
```

## Key Patterns

**Exponential Backoff**: `delay = baseDelay * 2^(attempt-1)`, capped at 30s max.

**Activity Tracking**: Call `session.touch()` after every operation to prevent idle timeout.

**Event-Driven**: Subscribe to SessionKeeper events for connection state changes.

## Constants

| Constant                          | Value             | Location               |
| --------------------------------- | ----------------- | ---------------------- |
| `DEFAULT_KEEPALIVE_INTERVAL_MS`   | 30000             | session.types.ts       |
| `DEFAULT_MAX_RECONNECT_ATTEMPTS`  | 5                 | session.types.ts       |
| `DEFAULT_BASE_RECONNECT_DELAY_MS` | 1000              | session.types.ts       |
| `DEFAULT_MAX_RECONNECT_DELAY_MS`  | 30000             | session.types.ts       |
| `DEFAULT_IDLE_TIMEOUT_MS`         | 900000            | session.types.ts       |
| `MAX_FILE_SIZE`                   | 104857600 (100MB) | sftp.ts                |
| `DEFAULT_SHELL_TIMEOUT_MS`        | 30000             | shell-session.types.ts |
| `DEFAULT_STALL_TIMEOUT_MS`        | 10000             | shell-session.types.ts |
| `MAX_OUTPUT_SIZE`                 | 10485760 (10MB)   | shell-session.types.ts |
| `STDIN_DELIVERY_DELAY_MS`         | 100               | shell-session.types.ts |

## Where to Look

| Task                          | Location                                               |
| ----------------------------- | ------------------------------------------------------ |
| Change reconnection timing    | `session.types.ts` calculateReconnectDelay()           |
| Change disk job persistence   | `job-store.ts` JobStore (dir defaults next to config)  |
| Add connection event          | `session.types.ts` SessionKeeperEvents interface       |
| Change file size limit        | `sftp.ts` MAX_FILE_SIZE constant                       |
| Change home dir expansion     | `sftp.ts` expandRemotePath(), resolveHomeDir()         |
| Change pool behavior          | `pool.ts` - simple Map, add/remove/clear               |
| Modify auth config building   | `session-connect-config.io.ts` buildSshConnectConfig() |
| Add shell type adapter        | `shell-adapter*.ts` - interface + per-shell impls      |
| Change shell auto-detection   | `shell-adapter.ts` detectShellType()                   |
| Change local port forward     | `local-forward.ts` createLocalForward()                |
| Change remote port forward    | `remote-forward.ts` createRemoteForward()              |
| Modify local forward tracking | `forward-registry.ts` ForwardRegistry class            |
| Modify remote forward track   | `remote-forward-registry.ts` RemoteForwardRegistry     |
| Change shell timeout          | `shell-session.types.ts` DEFAULT_SHELL_TIMEOUT_MS      |
| Change output size limit      | `shell-session.types.ts` MAX_OUTPUT_SIZE               |
| Modify shell output parsing   | `shell-session.types.ts` parseMarkedOutput()           |
| Change shell initialization   | `shell-session.io.ts` waitForInitialPrompt()           |
| Change command writing/stdin  | `shell-session-writer.ts` writeCommand()               |
| Change command history        | `shell-session-history.ts` ShellHistory class          |
| Change timeout/stall timers   | `shell-session-timers.ts` startTimeoutTimer(), etc.    |
| Modify jump host behavior     | `jump-stream.ts` createJumpStream()                    |

## Shell Adapter Architecture

Shell adapters abstract command wrapping and initialization across shell types:

- `ShellAdapter` interface (`shell-adapter.ts`): `wrapCommand()`, `buildInitCommands()`, `isEchoedCommandLine()`, `eofChar`, `lineEnding`
- Factory: `createShellAdapter(shellType)` returns the concrete adapter
- Detection: `detectShellType(promptText)` analyzes last line of initial prompt

**Auto-detection flow** (when `shellType` is `'auto'`, the default):

1. `ShellSession.initialize()` connects and waits for initial prompt
2. `waitForInitialPrompt()` returns the prompt text
3. `detectShellType()` matches against known patterns (PS prompt, drive-letter prompt, etc.)
4. Concrete adapter is created and used for all subsequent commands
5. Detected type is persisted to config via `persistShellType()` (best-effort)

**Stdin delivery**: Commands with `stdin` use a 100ms delay (`STDIN_DELIVERY_DELAY_MS`) between writing the wrapped command and delivering stdin+EOF, to ensure the target process is ready. Implemented in `shell-session-writer.ts`.

**cmd.exe wrapper details** (`shell-adapter-cmd.ts`):

- Two-line wrapper: `@call <command>\r\n` + `@echo. & echo MARKER & echo %ERRORLEVEL%\r\n`
- `call` forces cmd.exe to update `%ERRORLEVEL%` for built-ins (`echo`, `set`, `cd`, `dir`) that otherwise leave it stale
- Line 2 is a separate parse context, so `%ERRORLEVEL%` expands at parse time **after** line 1 completes
- `@` prefix suppresses command echoing; `isEchoedCommandLine()` filters residual conhost echoes
- Conhost wraps long echoed commands at ~80 cols; fragments are detected via substring + operator/partial-word heuristics
- `rem`/`goto`/`::` commands eat the rest of the line, so they use `@<command>` (no `call`) with hardcoded exit code 0

## Anti-Patterns

**Never use SSHConnection class** - it's dead code kept only for reference.

**Never block in connect()** - always use async/await with timeouts.

**Never log credentials** - auth info handled only in `session-connect-config.io.ts`.
