# src/ssh/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

SSH connection management: SessionKeeper (connection lifecycle), ConnectionPool (registry), FileTransfer (SFTP).

## Structure

| File            | Purpose                                                          | Lines |
| --------------- | ---------------------------------------------------------------- | ----- |
| `session.ts`    | SessionKeeper: EventEmitter-based connection with auto-reconnect | 266   |
| `pool.ts`       | ConnectionPool: Map registry with auto-removal on max-retries    | 44    |
| `sftp.ts`       | FileTransfer: upload/download with 100MB limit, recursive mkdir  | 185   |
| `connection.ts` | **DEAD CODE** - never use, kept for reference only               | 135   |

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

| Constant                          | Value             | Location   |
| --------------------------------- | ----------------- | ---------- |
| `DEFAULT_KEEPALIVE_INTERVAL_MS`   | 30000             | session.ts |
| `DEFAULT_MAX_RECONNECT_ATTEMPTS`  | 5                 | session.ts |
| `DEFAULT_BASE_RECONNECT_DELAY_MS` | 1000              | session.ts |
| `DEFAULT_MAX_RECONNECT_DELAY_MS`  | 30000             | session.ts |
| `DEFAULT_IDLE_TIMEOUT_MS`         | 900000            | session.ts |
| `MAX_FILE_SIZE`                   | 104857600 (100MB) | sftp.ts    |

## Where to Look

| Task                         | Location                                   |
| ---------------------------- | ------------------------------------------ |
| Change reconnection timing   | `session.ts` calculateReconnectDelay()     |
| Add connection event         | `session.ts` SessionKeeperEvents interface |
| Change file size limit       | `sftp.ts` MAX_FILE_SIZE constant           |
| Fix path expansion for macOS | `sftp.ts` expandRemotePath()               |
| Change pool behavior         | `pool.ts` - simple Map, add/remove/clear   |

## Anti-Patterns

**Never use SSHConnection class** - it's dead code kept only for reference.

**Never block in connect()** - always use async/await with timeouts.

**Never log credentials** - auth info handled only in buildConnectConfig().
