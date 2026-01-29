# AGENTS.md

<!-- Generated: 2026-01-29 | Commit: cc3ffc3 | Branch: master -->

## Overview

MCP server exposing 7 SSH tools (connect, execute, upload/download, etc.) via stdio transport. Uses ssh2 library with connection pooling and auto-reconnection.

## Structure

```
src/
├── index.ts          # Entry: loads config, creates SSHMCPServer, runs
├── server.ts         # SSHMCPServer class: wires McpServer + ConnectionPool + tools
├── config/
│   ├── loader.ts     # loadConfig(): JSON Schema validation via AJV, 0600 permission check
│   └── types.ts      # Config, ServerConfig, auth type guards
├── ssh/
│   ├── session.ts    # SessionKeeper: EventEmitter wrapping ssh2 Client, auto-reconnect
│   ├── pool.ts       # ConnectionPool: Map<serverId, SessionKeeper>
│   ├── connection.ts # SSHConnection: UNUSED legacy class (ignore)
│   └── sftp.ts       # FileTransfer: upload/download with 100MB limit
└── tools/            # See src/tools/AGENTS.md
    └── *.ts          # 7 MCP tools, each registerXxxTool()

tests/
├── unit/             # Vitest mocks, no network
└── e2e/              # Docker SSH container, real connections
```

## Where to Look

| Task                        | Location                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| Add new MCP tool            | `src/tools/` - see subdirectory AGENTS.md                           |
| Change connection behavior  | `src/ssh/session.ts` SessionKeeper class                            |
| Modify reconnection logic   | `src/ssh/session.ts` startReconnection(), calculateReconnectDelay() |
| Change file transfer limits | `src/ssh/sftp.ts` MAX_FILE_SIZE constant                            |
| Add config validation       | `src/config/loader.ts` CONFIG_SCHEMA object                         |
| Add new config field        | `src/config/types.ts` + update CONFIG_SCHEMA                        |
| Debug auth issues           | `src/ssh/session.ts` buildConnectConfig()                           |

## Code Map

| Class            | Purpose                                        | Key Methods                                  |
| ---------------- | ---------------------------------------------- | -------------------------------------------- |
| `SSHMCPServer`   | Main server, wires everything                  | `run()`, `shutdown()`                        |
| `SessionKeeper`  | Single SSH connection with keepalive/reconnect | `connect()`, `disconnect()`, `healthCheck()` |
| `ConnectionPool` | Manages multiple SessionKeepers                | `add()`, `get()`, `remove()`, `clear()`      |
| `FileTransfer`   | SFTP operations                                | `upload()`, `download()`                     |

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

**Timeouts** (all in seconds):

- Connection: 10s default
- Command: 60s default
- Idle: 900s (15 min)

## Anti-Patterns (Project-Specific)

**Type Cast in Tools**: All tools use `(server.tool as any)` due to SDK typing limitations. Do NOT "fix" this - SDK types don't match runtime API.

**Unused SSHConnection Class**: `src/ssh/connection.ts` is DEAD CODE. Use `SessionKeeper` instead.

**Hardcoded Limits**:

- File transfer: 100MB (`src/ssh/sftp.ts` MAX_FILE_SIZE)
- Command output: 10MB (`src/tools/execute.ts` MAX_OUTPUT_SIZE)
- To change: modify constants, but consider memory implications.

**Home Directory Expansion**: `expandHomePath()` in sftp.ts assumes Linux paths (`/home/${username}`). Does not work on macOS or Windows servers.

## Commands

```bash
npm test              # Unit tests (fast, mocked)
npm run test:e2e      # E2E tests (Docker required, auto-manages container)
npm run test:all      # Both
npm run build         # TypeScript → dist/
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
```

## Testing Notes

- E2E tests use `tests/e2e/docker/` - container starts/stops automatically
- Test config fixtures in `tests/fixtures/`
- Mock patterns: `vi.mock()` with factory functions
- 203 total tests: 140 unit + 63 E2E
