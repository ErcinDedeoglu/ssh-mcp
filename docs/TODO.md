# TODO

## High Priority

- [ ] Local port forwarding (`forward_port`) - Access remote databases, internal APIs
- [ ] Remote port forwarding (`forward_remote_port`) - Expose local services to remote
- [ ] List active tunnels (`list_forwards`) - Track what's forwarded
- [ ] Close tunnel (`unforward_port`) - Cleanup resources

## Medium Priority

- [ ] Jump host support (`jump_connect`) - Reach servers behind bastions

## Low Priority

- [ ] Dynamic SOCKS proxy - Route all traffic through SSH
- [ ] SSH agent forwarding - Git operations from remote using local keys
- [ ] Persistent shell sessions - Maintain cwd/env across commands

## Security Debt (SECURITY.md claims but not implemented)

- [ ] **SSH host key verification** - Prevent MITM attacks (doc says "MUST implement")
- [ ] **maxConnections enforcement** - Pool has no limit despite config option
- [ ] **reuseConnections** - Config option exists but never read
- [ ] **Pool isolation per MCP client** - Currently single pool per process
- [ ] **Structured JSON logging** - Audit log format documented but not implemented
- [ ] Update SECURITY.md to reflect actual implementation status
