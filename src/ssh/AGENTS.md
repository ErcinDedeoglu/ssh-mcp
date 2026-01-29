# src/ssh/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

SSH connection management: SessionKeeper (connection lifecycle), ConnectionPool (registry), FileTransfer (SFTP), ForwardRegistry (port forwarding), ShellSession (persistent shell).

## Structure

| File                           | Purpose                                                           | Lines |
| ------------------------------ | ----------------------------------------------------------------- | ----- |
| `session.ts`                   | SessionKeeper: EventEmitter-based connection with auto-reconnect  | 199   |
| `session.types.ts`             | Types, constants, pure functions (calculateReconnectDelay, etc.)  | 58    |
| `session-connect-config.io.ts` | buildSshConnectConfig(): auth config builder for ssh2             | 50    |
| `pool.ts`                      | ConnectionPool: Map registry with auto-removal on max-retries     | 43    |
| `sftp.ts`                      | FileTransfer: upload/download with 100MB limit, recursive mkdir   | 189   |
| `forward-registry.ts`          | ForwardRegistry: tracks active port forwards, cleanup on close    | 97    |
| `local-forward.ts`             | createLocalForward(): net.Server + ssh2 forwardOut() wiring       | 105   |
| `shell-session.ts`             | ShellSession: persistent shell with marker-based command exec     | 199   |
| `shell-session.types.ts`       | Types, constants, marker generation, output parsing functions     | 100   |
| `shell-session.io.ts`          | Prompt waiting functions (waitForInitialPrompt, waitForMcpPrompt) | 38    |
| `shell-registry.ts`            | ShellRegistry: Map of serverId → ShellSession                     | 36    |
| `connection.ts`                | **DEAD CODE** - never use, kept for reference only                | 136   |

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

## Where to Look

| Task                         | Location                                               |
| ---------------------------- | ------------------------------------------------------ |
| Change reconnection timing   | `session.types.ts` calculateReconnectDelay()           |
| Add connection event         | `session.types.ts` SessionKeeperEvents interface       |
| Change file size limit       | `sftp.ts` MAX_FILE_SIZE constant                       |
| Fix path expansion for macOS | `sftp.ts` expandRemotePath()                           |
| Change pool behavior         | `pool.ts` - simple Map, add/remove/clear               |
| Modify auth config building  | `session-connect-config.io.ts` buildSshConnectConfig() |
| Change port forward behavior | `local-forward.ts` createLocalForward()                |
| Modify forward tracking      | `forward-registry.ts` ForwardRegistry class            |
| Change shell timeout         | `shell-session.types.ts` DEFAULT_SHELL_TIMEOUT_MS      |
| Change output size limit     | `shell-session.types.ts` MAX_OUTPUT_SIZE               |
| Modify shell output parsing  | `shell-session.types.ts` parseMarkedOutput()           |
| Change shell initialization  | `shell-session.io.ts` waitForInitialPrompt()           |

## Anti-Patterns

**Never use SSHConnection class** - it's dead code kept only for reference.

**Never block in connect()** - always use async/await with timeouts.

**Never log credentials** - auth info handled only in `session-connect-config.io.ts`.
