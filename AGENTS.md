# AGENTS.md

<!-- Generated: 2026-02-21 | Branch: v1.0 -->

## Overview

Dual-mode SSH tool: MCP server (16 SSH tools via stdio) AND standalone CLI (exec, transfer, forwarding, background jobs). Uses ssh2 library with connection pooling, auto-connect, and auto-reconnection. Both frontends share one business-logic layer (`src/actions/`).

## Structure

```
src/
├── index.ts          # Entry: dual-mode dispatch - no args/`mcp` = stdio server, else CLI
├── server-entry.ts   # runMcpServer(): config load + SSHMCPServer + signal handlers
├── server.ts         # SSHMCPServer class: wires McpServer + ConnectionPool + tools
├── actions/          # See src/actions/AGENTS.md - shared business logic (MCP-free)
│   └── *.ts          # 16 actions: typed input → ActionOutcome, deps injected
├── cli/              # See src/cli/AGENTS.md - commander CLI (one-shot per invocation)
│   ├── main.ts       # runCli(argv): command tree + hidden run-job runner entry
│   ├── context.ts    # buildCliDeps() / cleanupCli()
│   ├── job-launch.ts # exec --bg: detached runner spawn
│   ├── job-runner.ts # runner child: execute → stream to JobStore
│   ├── forward-store.ts # CLI forward tracking (forwards.json, pid liveness)
│   ├── output.ts     # report(): ActionOutcome → stdout/stderr + exit code
│   └── commands/     # exec, job, transfer, connection, forward command families
├── utils/
│   └── sanitize.ts   # sanitizeError / sanitizePath / truncateOutput (shared)
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
│   ├── job-registry.ts         # JobRegistry: in-memory job tracking for execute_background
│   ├── job-store.ts            # JobStore: disk-backed job persistence for CLI bg jobs
│   ├── forward-registry.ts     # ForwardRegistry: tracks active port forwards
│   ├── local-forward.ts        # createLocalForward(): net.Server + ssh2 forwardOut()
│   ├── remote-forward.ts       # createRemoteForward(): ssh2 forwardIn() wiring
│   ├── remote-forward-registry.ts  # RemoteForwardRegistry: tracks remote port forwards
│   ├── jump-stream.ts          # createJumpStream(): nested SSH through bastion
│   ├── sftp.ts                 # FileTransfer: upload/download with 100MB limit, cross-platform ~
│   └── connection.ts           # DEAD CODE - ignore
└── tools/            # See src/tools/AGENTS.md
    └── *.ts          # 16 MCP tool wrappers (schema + register) over actions/

tests/
├── unit/             # Vitest mocks, no network
├── integration/      # SSHMCPServer with mocked transport
└── e2e/              # See tests/e2e/ssh/AGENTS.md
    └── ssh/          # Docker SSH containers, real connections
```

## Where to Look

| Task                         | Location                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Add new MCP tool             | `src/tools/` + action in `src/actions/` - see subdirectory AGENTS.md                   |
| Add new CLI command          | `src/cli/commands/` + register in `src/cli/main.ts`                                    |
| Change shared tool/CLI logic | `src/actions/` - single source of truth for both frontends                            |
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
| CLI background jobs          | `src/cli/job-launch.ts` + `src/cli/job-runner.ts` + `src/ssh/job-store.ts`             |
| Change dual-mode dispatch    | `src/index.ts` main() - no args/`mcp` = MCP, else CLI                                  |
| Add E2E tests                | `tests/e2e/ssh/` - see subdirectory AGENTS.md                                          |

## Code Map

| Class             | Purpose                                        | Key Methods                                      |
| ----------------- | ---------------------------------------------- | ------------------------------------------------ |
| `SSHMCPServer`    | Main MCP server, wires everything              | `run()`, `shutdown()`                            |
| `SessionKeeper`   | Single SSH connection with keepalive/reconnect | `connect()`, `disconnect()`, `healthCheck()`     |
| `ConnectionPool`  | Manages multiple SessionKeepers                | `add()`, `get()`, `remove()`, `clear()`          |
| `FileTransfer`    | SFTP operations                                | `upload()`, `download()`                         |
| `ForwardRegistry` | Tracks active port forwards                    | `add()`, `get()`, `remove()`, `removeByServer()` |
| `JobRegistry`     | In-memory background jobs (MCP mode)           | `create()`, `get()`, `setResult()`, `appendOutput()` |
| `JobStore`        | Disk-backed background jobs (CLI mode)         | `save()`, `read()`, `appendOutput()`, `list()`   |

### SessionKeeper Events

- `connected`, `disconnected` - connection state
- `reconnecting(attempt, delayMs)` - exponential backoff in progress
- `reconnected(attempts)` - successfully reconnected
- `max-retries-reached(attempts)` - gave up, removed from pool

## Conventions

**ES Modules**: All imports use `.js` extension (TypeScript outputs ES modules).

**Config Path**: `~/.ssh-mcp/config.json` with mandatory 0600 permissions.

**Error Handling**: All tool/CLI errors go through `sanitizeError()` - never expose credentials.

**Validation Stack**:

- Config: AJV JSON Schema (`src/config/loader.ts`)
- MCP tool inputs: Zod schemas (each tool file)
- CLI inputs: commander parsing (validated in command layer)

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

**CLI One-Shot Semantics**: Each CLI invocation builds fresh deps and disconnects at the end - no cwd/env persistence between `exec` calls (MCP keeps persistent shells). `exec` joins args with spaces like `ssh`; quote as one string for shell operators. Long-lived features have CLI-specific process models: foreground forwards (Ctrl-C stops, tracked in `forwards.json` by pid) and detached background jobs (`exec --bg` → runner child, persisted in `<config-dir>/jobs/`).

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
node dist/index.js --help       # CLI help (build first)
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
