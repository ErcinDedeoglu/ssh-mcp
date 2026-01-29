# TODO

## High Priority

- [x] Local port forwarding (`forward_port`) - Access remote databases, internal APIs
- [x] List active tunnels (`list_forwards`) - Track what's forwarded
- [x] Close tunnel (`close_forward`) - Cleanup resources
- [ ] Remote port forwarding (`forward_remote_port`) - Expose local services to remote

## Medium Priority

- [ ] Jump host support (`jump_connect`) - Reach servers behind bastions

## Low Priority

- [ ] Dynamic SOCKS proxy - Route all traffic through SSH
- [ ] SSH agent forwarding - Git operations from remote using local keys
- [ ] Persistent shell sessions - Maintain cwd/env across commands

## Test Gaps (Port Forwarding)

### High Priority

- [ ] **SSH disconnect during active forward** - Test what happens to tunneled connections when SSH drops mid-transfer. Current behavior unknown.
- [ ] **Forward survival after SSH reconnect** - Forwards hold reference to old SSH client. After auto-reconnect, forwards are likely broken. Need test to verify + potential fix.

### Medium Priority

- [ ] **Tool input validation** - Test invalid port numbers (-1, 70000, non-integer), empty/invalid hosts, SQL injection in host strings
- [ ] **Port already in use (OS level)** - Test EADDRINUSE when localPort conflicts with system port (not just registry duplicate)

### Low Priority

- [ ] **Large data transfer through tunnel** - Stress test streaming >1MB through forwarded port
- [ ] **Server shutdown cleanup verification** - Explicit test that `SSHMCPServer.shutdown()` properly closes all forwards
- [ ] **Rapid forward create/delete cycles** - Stress test forward lifecycle

## Security Debt (SECURITY.md claims but not implemented)

- [ ] **SSH host key verification** - Prevent MITM attacks (doc says "MUST implement")
- [ ] **maxConnections enforcement** - Pool has no limit despite config option
- [ ] **reuseConnections** - Config option exists but never read
- [ ] **Pool isolation per MCP client** - Currently single pool per process
- [ ] **Structured JSON logging** - Audit log format documented but not implemented
- [ ] Update SECURITY.md to reflect actual implementation status
