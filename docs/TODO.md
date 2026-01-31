# TODO

## High Priority

- [x] Local port forwarding (`forward_port`) - Access remote databases, internal APIs
- [x] List active tunnels (`list_forwards`) - Track what's forwarded
- [x] Close tunnel (`close_forward`) - Cleanup resources
- [x] Remote port forwarding (`forward_remote_port`) - Expose local services to remote

## Medium Priority

- [x] Jump host support (`jump_connect`) - Reach servers behind bastions

## Low Priority

- [ ] Dynamic SOCKS proxy - Route all traffic through SSH
- [ ] SSH agent forwarding - Git operations from remote using local keys
- [x] Persistent shell sessions - Maintain cwd/env across commands (uses `client.shell()` with marker-based output parsing)
- [x] Console history (`get_console_history`) - Retrieve previous command outputs (100 entries max, 50KB per output)
- [x] Auto-connect - Tools automatically connect when needed, no manual `connect` required

## Test Gaps (Port Forwarding)

### High Priority

- [x] **SSH disconnect during active forward** - Forwards are cleaned up on disconnect. Tests in `port-forward-disconnect.e2e.test.ts` (4 tests).
- [x] **Forward survival after SSH reconnect** - Forwards are intentionally removed on disconnect; can be re-created after reconnect. Tests in `port-forward-disconnect-recovery.e2e.test.ts` (2 tests).

### Medium Priority

- [x] **Tool input validation** - Added `.max(65535)` to port schemas, `.min(1)` to host schemas. Tests in `forward-port-validation.test.ts` (17 tests).
- [x] **Port already in use (OS level)** - E2E test in `port-forward-create.e2e.test.ts` verifies EADDRINUSE when port bound by another process.

### Low Priority

- [x] **Large data transfer** - Stress test in `port-forward-connections.e2e.test.ts` verifies >1MB through SSH command execution.
- [x] **Server shutdown cleanup verification** - Test in `tests/integration/server.test.ts` verifies `shutdown()` closes all forward servers and sockets.
- [x] **Rapid forward create/delete cycles** - Test in `port-forward-connections.e2e.test.ts` runs 10 create/delete cycles.

## Test Gaps (Auto-Connect & Core)

- [x] **ensure-connected.ts unit tests** - 15 tests across 3 files: session-states, auto, handlers
- [x] **Auto-connect E2E tests** - 10 tests across 3 files: core, tools, transfer
- [x] **get-console-history.ts unit tests** - 6 tests for shell registry interaction
- [x] **session.types.ts pure functions** - 21 tests for constants and calculateReconnectDelay/safeEmitError
- [x] **shell-registry.ts** - 16 tests for registry CRUD and destroy behavior

## Agent UX Gaps (Tool descriptions missing critical info)

### High Priority

- [x] **Add workflow guidance to `execute` description** - RESOLVED: Auto-connect implemented, tools connect automatically when needed
- [x] **Document jump host no-reconnect in `jump_connect`** - Added note: "Jump connections do NOT auto-reconnect"

### Medium Priority

- [x] **Add 100MB limit to upload/download descriptions** - Already present: `Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
- [x] **Wrap `list_servers` in try-catch** - Added try-catch with sanitizeError()
- [x] **Add idle warning to `connection_status` response** - Added `idleWarning` field when connection is idle
- [x] **Add history count warning to `disconnect` response** - Added warning in description + `shellHistoryCleared` field in response

### Low Priority

- [x] **Create MCP resource with workflow guide** - RESOLVED: Simplified to list_servers → execute → disconnect (auto-connect handles connection)
- [x] **Document timeout hierarchy in `execute`** - Added: "Timeout priority: timeout param > server config > global defaults > 60s"
- [x] **Add `touch()` to read-only tools or document behavior** - Documented in descriptions: "read-only check and does NOT reset the idle timer"

## Long-Running Command Support

Commands like `apt upgrade`, `npm install`, or compilation jobs fail due to architectural limitations.

### High Priority

- [x] **Configurable stall timeout** - Added `stallTimeout` parameter to `execute` tool. Pass milliseconds to override default, `0` or `null` to disable.
- [x] **Disable stall timeout option** - `stallTimeout: 0` or `null` disables stall detection for known-slow commands.

### Medium Priority

- [x] **Background execution mode** - New `execute_background` tool returns job ID. Use `check_job` to poll status/output, `cancel_job` to cancel.
- [x] **Command cancellation** - Added `cancel_job` tool that sends SIGINT (Ctrl+C) to remote process. Also used internally on timeout.

### Low Priority

- [ ] **Streaming output** - Use MCP progress notifications to stream output chunks during execution. Lets agent see progress and detect hangs.
- [ ] **Progress indicators** - Report percentage completion for commands that support it

## Security Debt (SECURITY.md claims but not implemented)

- [ ] **SSH host key verification** - Prevent MITM attacks (doc says "MUST implement")
- [ ] **maxConnections enforcement** - Pool has no limit despite config option
- [ ] **reuseConnections** - Config option exists but never read
- [ ] **Pool isolation per MCP client** - Currently single pool per process
- [ ] **Structured JSON logging** - Audit log format documented but not implemented
- [ ] Update SECURITY.md to reflect actual implementation status

---

## Gap Analysis (vs. Market Expectations)

_Compiled from analysis of 170+ SSH MCP implementations and 2,100+ related issues._

### 🔴 Critical Security Gaps

- [ ] **Command whitelisting/blacklisting** - Users expect regex-based allow/block patterns. Currently ANY command can run (`rm -rf /`, `shutdown`). Add `security.allowedCommands` / `security.blockedCommands` to config.
- [ ] **Audit logging** - No structured logging for compliance (SOC2, ISO 27001). Add JSON audit trail: timestamp, serverId, tool, command, exitCode, commandHash.
- [ ] **Output truncation** - Returns up to 10MB output, will crash Claude Code. Add `maxOutputLength` config (default: 10000 chars) with truncation notice.
- [ ] **SECURITY.md missing** - README references it but file doesn't exist. Create comprehensive threat model doc.

### 🟡 Usability Gaps (Medium Priority)

- [ ] **cwd parameter** - Users expect `cwd` per-command without needing prior `cd`. Add optional `cwd` to execute tool.
- [ ] **Sudo support** - Cannot run elevated commands. Add `sudo: true` parameter with optional password.
- [ ] **Server tags/groups** - Cannot bulk-execute on multiple servers. Add `tags: ["prod", "web"]` to server config + `execute_on_tag` tool.
- [ ] **Dry-run mode** - Cannot preview commands. Add `dryRun: true` parameter returning command preview.
- [ ] **SSH config import** - Must duplicate `~/.ssh/config` manually. Add option to import host aliases.
- [ ] **Health check tool** - Must parse raw `free -m`, `df -h` output. Add `health_check` tool returning structured metrics.
- [ ] **Home path expansion bug** - `expandRemotePath()` hardcodes `/home/${username}`, breaks on macOS (`/Users/`) and non-standard homes. Query via `$HOME`.

### 🟢 Nice-to-Have Gaps (Low Priority)

- [ ] **Docker deployment** - No container support. Add Dockerfile + docker-compose.yml.
- [ ] **rsync/sync tool** - Single file transfer only. Add `sync` tool for bidirectional sync.
- [ ] **Database backup tools** - Must run manual mysqldump. Add `backup_database` tool.
- [ ] **Process management** - Must parse `ps` output. Add `list_processes` / `kill_process` tools.
- [ ] **Log tailing tool** - No dedicated streaming. Add `tail_logs` tool.
- [ ] **Tool activation system** - All 13 tools always loaded. Add `enabledTools` config to reduce AI context.
- [ ] **Windows server support** - Hardcoded Linux paths. Document limitation or add PowerShell support.

### ✅ Competitive Advantages (Already Implemented)

| Feature                             | Status | Competitors    |
| ----------------------------------- | ------ | -------------- |
| Jump host support                   | ✅     | Most lack this |
| Persistent shell sessions           | ✅     | Unique         |
| Background job execution            | ✅     | Unique         |
| Real-time streaming output          | ✅     | Rare           |
| Port forwarding (local + remote)    | ✅     | ~50% have      |
| Connection pooling + auto-reconnect | ✅     | Standard       |
