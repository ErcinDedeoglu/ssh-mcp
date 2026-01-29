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
- [ ] Persistent shell sessions - Maintain cwd/env across commands

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

## Security Debt (SECURITY.md claims but not implemented)

- [ ] **SSH host key verification** - Prevent MITM attacks (doc says "MUST implement")
- [ ] **maxConnections enforcement** - Pool has no limit despite config option
- [ ] **reuseConnections** - Config option exists but never read
- [ ] **Pool isolation per MCP client** - Currently single pool per process
- [ ] **Structured JSON logging** - Audit log format documented but not implemented
- [ ] Update SECURITY.md to reflect actual implementation status
