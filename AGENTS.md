# AGENTS.md

<!-- Generated: 2026-02-21 | Branch: v1.0 -->

## Overview

MCP server exposing 13 SSH tools (execute, upload/download, port forwarding, jump hosts, etc.) via stdio transport. Uses ssh2 library with connection pooling, auto-connect, and auto-reconnection.

## Structure

```
src/
├── index.ts          # Entry: loads config, creates SSHMCPServer, runs
├── server.ts         # SSHMCPServer class: wires McpServer + ConnectionPool + tools
├── config/
│   ├── loader.ts     # loadConfig(): JSON Schema validation via AJV, 0600 permission check
│   ├── path.ts       # getConfigPath(), expandHome() - shared config path utilities
│   ├── writer.ts     # persistShellType(): writes auto-detected shell type back to config
│   └── types.ts      # Config, ServerConfig, ShellType, ConcreteShellType, auth type guards
├── ssh/              # See src/ssh/AGENTS.md
│   ├── session.ts              # SessionKeeper: EventEmitter wrapping ssh2 Client, auto-reconnect
│   ├── session.types.ts        # Types, constants, pure functions (calculateReconnectDelay, safeEmitError)
│   ├── session-connect-config.io.ts  # buildSshConnectConfig() - auth config builder
│   ├── session-ping.io.ts      # SSH-level ping via global request
│   ├── pool.ts                 # ConnectionPool: Map<serverId, SessionKeeper>
│   ├── shell-adapter.ts        # ShellAdapter interface, createShellAdapter(), detectShellType()
│   ├── shell-adapter-posix.ts  # PosixShellAdapter: bash/sh/zsh command wrapping
│   ├── shell-adapter-powershell.ts  # PowerShellAdapter: PowerShell command wrapping
│   ├── shell-adapter-cmd.ts    # CmdShellAdapter: cmd.exe command wrapping (call + two-line wrapper)
│   ├── shell-session.ts        # ShellSession: persistent shell with marker-based command exec
│   ├── shell-session.types.ts  # Types, constants, marker generation, output parsing
│   ├── shell-session.io.ts     # Prompt waiting functions (waitForInitialPrompt, waitForMcpPrompt)
│   ├── shell-session-writer.ts # writeCommand(): writes wrapped commands + optional stdin to stream
│   ├── shell-session-history.ts # ShellHistory: command history tracking with truncation
│   ├── shell-session-timers.ts # Timer state management (timeout + stall timers)
│   ├── shell-registry.ts       # ShellRegistry: Map of serverId → ShellSession
│   ├── job-registry.ts         # JobRegistry: background job tracking for execute_background
│   ├── forward-registry.ts     # ForwardRegistry: tracks active port forwards
│   ├── local-forward.ts        # createLocalForward(): net.Server + ssh2 forwardOut()
│   ├── remote-forward.ts       # createRemoteForward(): ssh2 forwardIn() wiring
│   ├── remote-forward-registry.ts  # RemoteForwardRegistry: tracks remote port forwards
│   ├── jump-stream.ts          # createJumpStream(): nested SSH through bastion
│   ├── sftp.ts                 # FileTransfer: upload/download with 100MB limit, cross-platform ~
│   └── connection.ts           # DEAD CODE - ignore
└── tools/            # See src/tools/AGENTS.md
    └── *.ts          # 13 MCP tools, each registerXxxTool()

tests/
├── unit/             # Vitest mocks, no network
├── integration/      # SSHMCPServer with mocked transport
└── e2e/              # See tests/e2e/ssh/AGENTS.md
    └── ssh/          # Docker SSH containers, real connections
```

## Where to Look

| Task                         | Location                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Add new MCP tool             | `src/tools/` - see subdirectory AGENTS.md                                              |
| Change connection behavior   | `src/ssh/session.ts` SessionKeeper class                                               |
| Modify reconnection logic    | `src/ssh/session.ts` startReconnection(), `session.types.ts` calculateReconnectDelay() |
| Change file transfer limits  | `src/ssh/sftp.ts` MAX_FILE_SIZE constant                                               |
| Add config validation        | `src/config/loader.ts` CONFIG_SCHEMA object                                            |
| Add new config field         | `src/config/types.ts` + update CONFIG_SCHEMA                                           |
| Change config path           | `src/config/path.ts` getConfigPath(), expandHome()                                     |
| Persist runtime config       | `src/config/writer.ts` persistShellType()                                              |
| Debug auth issues            | `src/ssh/session-connect-config.io.ts` buildSshConnectConfig()                         |
| Change port forward behavior | `src/ssh/local-forward.ts` createLocalForward()                                        |
| Change remote port forward   | `src/ssh/remote-forward.ts` createRemoteForward()                                      |
| Change shell command exec    | `src/ssh/shell-session.ts` ShellSession class                                          |
| Add shell type adapter       | `src/ssh/shell-adapter*.ts` - interface + per-shell implementations                    |
| Change shell auto-detection  | `src/ssh/shell-adapter.ts` detectShellType()                                           |
| Jump host connections        | `src/ssh/jump-stream.ts` createJumpStream()                                            |
| Add E2E tests                | `tests/e2e/ssh/` - see subdirectory AGENTS.md                                          |

## Code Map

| Class             | Purpose                                        | Key Methods                                      |
| ----------------- | ---------------------------------------------- | ------------------------------------------------ |
| `SSHMCPServer`    | Main server, wires everything                  | `run()`, `shutdown()`                            |
| `SessionKeeper`   | Single SSH connection with keepalive/reconnect | `connect()`, `disconnect()`, `healthCheck()`     |
| `ConnectionPool`  | Manages multiple SessionKeepers                | `add()`, `get()`, `remove()`, `clear()`          |
| `FileTransfer`    | SFTP operations                                | `upload()`, `download()`                         |
| `ForwardRegistry` | Tracks active port forwards                    | `add()`, `get()`, `remove()`, `removeByServer()` |

### SessionKeeper Events

- `connected`, `disconnected` - connection state
- `reconnecting(attempt, delayMs)` - exponential backoff in progress
- `reconnected(attempts)` - successfully reconnected
- `max-retries-reached(attempts)` - gave up, removed from pool

## Conventions

**ES Modules**: All imports use `.js` extension (TypeScript outputs ES modules).

**Config Path**: `~/.ssh-mcp/config.json` with mandatory 0600 permissions.

**Error Handling**: All tool errors go through `sanitizeError()` - never expose credentials.

**Validation Stack**:

- Config: AJV JSON Schema (`src/config/loader.ts`)
- Tool inputs: Zod schemas (each tool file)

**200-Line Limit**: Custom ESLint rule enforces max 200 lines per file.

**Timeouts** (all in seconds):

- Connection: 10s default
- Command: 60s default
- Idle: 900s (15 min)

## Anti-Patterns (Project-Specific)

**Type Cast in Tools**: All tools use `(server.tool as any)` due to SDK typing limitations. Do NOT "fix" this.

**Unused SSHConnection Class**: `src/ssh/connection.ts` is DEAD CODE. Use `SessionKeeper` instead.

**Hardcoded Limits**:

- File transfer: 100MB (`src/ssh/sftp.ts` MAX_FILE_SIZE)
- Command output: 10MB (`src/ssh/shell-session.types.ts` MAX_OUTPUT_SIZE)

**Home Directory Expansion**: `expandRemotePath()` in sftp.ts uses `sftp.realpath('.')` for cross-platform `~` expansion (Linux, macOS, Windows). Falls back to `/home/${username}` if `realpath` fails.

## Commands

```bash
bun run test                    # Unit tests (fast, mocked, parallel)
bun run test:e2e                # E2E tests - parallel 8 shards (default)
bun run test:e2e:sequential     # E2E tests - single shard for debugging
SHARDS=4 bun run test:e2e       # E2E tests - custom shard count
bun run test:all                # Unit + E2E
bun run build                   # TypeScript → dist/
bun run lint                    # ESLint + Prettier + typecheck
bun run typecheck               # tsc --noEmit
```

## Testing Notes

- E2E tests in `tests/e2e/ssh/` - modular structure with shared setup
- Docker containers: 3 SSH servers (password auth, key auth, key+passphrase)
- Test scripts auto-manage Docker lifecycle
- Mock pattern: `vi.hoisted()` for early mock setup, instance tracking arrays
- Unit tests use Vitest globals - no imports needed for `describe`, `it`, `expect`

---

## Tool Design Philosophy

**`execute` is the primary tool. Use it for everything.**

Shell commands cover: `ls`, `cat`, `mkdir`, `rm`, `chmod`, `stat`, `grep`, `find`, `ps`, `kill`, file I/O via `echo`/`cat`, `base64`, `tar`, `curl`, `wget`, etc.

**Only add a dedicated tool when `execute` is literally impossible:**

| Tool                | Why `execute` can't do it                 |
| ------------------- | ----------------------------------------- |
| `disconnect`        | SSH protocol session management           |
| `upload/download`   | SFTP subsystem - binary-safe, files >10MB |
| `connection_status` | SSH session state inspection              |
| Port forwarding     | SSH protocol TCP channel multiplexing     |
| Jump hosts          | Nested SSH connections through bastion    |
