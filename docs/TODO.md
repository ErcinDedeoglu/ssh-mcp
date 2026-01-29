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
