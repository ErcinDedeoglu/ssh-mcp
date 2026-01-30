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

## Agent UX Gaps (Tool descriptions missing critical info)

### High Priority

- [ ] **Add workflow guidance to `execute` description** - Agent doesn't know `connect` must be called first
- [ ] **Document jump host no-reconnect in `jump_connect`** - `maxReconnectAttempts: 0` not mentioned, agent keeps trying dead connection

### Medium Priority

- [ ] **Add 100MB limit to upload/download descriptions** - Agent only discovers limit after transfer fails
- [ ] **Wrap `list_servers` in try-catch** - Only tool without error handling, config errors crash instead of returning error
- [ ] **Add idle warning to `connection_status` response** - Connection idle after 15min but no auto-disconnect or warning
- [ ] **Add history count warning to `disconnect` response** - Shell history (100 entries) destroyed without warning

### Low Priority

- [ ] **Create MCP resource with workflow guide** - Document: list_servers → connect → execute → disconnect
- [ ] **Document timeout hierarchy in `execute`** - param > server config > global defaults not explained
- [ ] **Add `touch()` to read-only tools or document behavior** - connection_status/get_console_history don't reset idle timer

## Security Debt (SECURITY.md claims but not implemented)

- [ ] **SSH host key verification** - Prevent MITM attacks (doc says "MUST implement")
- [ ] **maxConnections enforcement** - Pool has no limit despite config option
- [ ] **reuseConnections** - Config option exists but never read
- [ ] **Pool isolation per MCP client** - Currently single pool per process
- [ ] **Structured JSON logging** - Audit log format documented but not implemented
- [ ] Update SECURITY.md to reflect actual implementation status
