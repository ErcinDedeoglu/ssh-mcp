# Security Guidelines

## Overview

This document outlines the security model, threat considerations, and best practices for the SSH MCP server.

## Threat Model

### Assets Protected
- SSH credentials (passwords, private keys, passphrases)
- Remote server access
- Command execution capabilities
- File system access on remote servers

### Threat Actors
- **Malicious MCP clients**: Unauthorized applications attempting to use the MCP server
- **Local attackers**: Users with access to the host machine running the MCP server
- **Network attackers**: Interceptors of network traffic between MCP server and SSH hosts
- **Log aggregators**: Systems that collect and store application logs

### Attack Vectors
1. **Credential exposure**: Config file read by unauthorized users
2. **Credential leakage**: Passwords/keys logged in error messages or debug output
3. **Path traversal**: Malicious file paths in commands exposing sensitive data
4. **Command injection**: Unsafe command construction leading to arbitrary execution
5. **Connection hijacking**: Reuse of pooled connections by unauthorized clients

## Credential Handling

### Storage Requirements

**CRITICAL**: The configuration file MUST have restrictive permissions:

```bash
chmod 0600 ~/.ssh-mcp/config.json
```

**Rationale**: Prevents other users on the system from reading SSH credentials.

**Verification**:
```bash
ls -la ~/.ssh-mcp/config.json
# Expected: -rw------- (0600)
```

### Authentication Methods

#### SSH Keys (RECOMMENDED)
- **Preferred**: Use SSH key-based authentication
- **Key permissions**: Private key files MUST have 0600 permissions
- **Passphrase protection**: Use encrypted keys with passphrases when possible
- **Key rotation**: Rotate SSH keys periodically (every 90 days recommended)

Example:
```json
{
  "auth": {
    "privateKey": "/home/user/.ssh/id_ed25519",
    "passphrase": "strong-passphrase-here"
  }
}
```

#### Password Authentication (NOT RECOMMENDED)
- **Use only for**: Development/testing environments
- **Never use for**: Production systems
- **Risk**: Passwords stored in plaintext in config file

Example:
```json
{
  "auth": {
    "password": "temporary-dev-password"
  }
}
```

### Credential Lifecycle

1. **Loading**: Read config file once at startup, validate permissions
2. **Runtime**: Keep credentials in memory only, never write to disk
3. **Shutdown**: Clear credential objects from memory
4. **Rotation**: Restart server after updating credentials in config

## Error Sanitization Rules

### NEVER Log These Values

**Forbidden in logs/errors**:
- Passwords (`auth.password`)
- Private key contents
- Passphrases (`auth.passphrase`)
- Full file paths containing usernames (sanitize to relative paths)
- SSH session tokens/cookies

### Sanitization Examples

#### ❌ WRONG - Exposes credentials
```javascript
logger.error(`Failed to connect with password: ${config.auth.password}`);
logger.error(`SSH key not found: ${config.auth.privateKey}`);
```

#### ✅ CORRECT - Sanitized output
```javascript
logger.error(`Failed to connect to ${serverId} (auth method: password)`);
logger.error(`SSH key not found: ${sanitizePath(config.auth.privateKey)}`);
```

### Path Sanitization

**Rule**: Replace absolute paths with relative or masked versions

```javascript
// Input:  /home/alice/.ssh/id_rsa
// Output: ~/.ssh/id_rsa

// Input:  /var/secrets/production.key
// Output: <config-dir>/production.key
```

### Error Message Template

```
Error: [Operation] failed for server [serverId]
Reason: [Sanitized error message]
Auth method: [password|privateKey]
Timestamp: [ISO 8601]
```

**Example**:
```
Error: SSH connection failed for server prod-web-01
Reason: Connection timeout after 10s
Auth method: privateKey
Timestamp: 2026-01-28T17:45:00Z
```

## Timeout Configurations

### Connection Timeout
- **Default**: 10 seconds
- **Range**: 1-300 seconds
- **Purpose**: Prevent indefinite hangs on unreachable hosts
- **Security impact**: Limits exposure time during connection attempts

### Command Timeout
- **Default**: 60 seconds
- **Range**: 1-3600 seconds
- **Purpose**: Prevent runaway commands from consuming resources
- **Security impact**: Mitigates denial-of-service via long-running commands

### Idle Timeout
- **Default**: 900 seconds (15 minutes)
- **Range**: 60-7200 seconds
- **Purpose**: Close inactive connections to free resources
- **Security impact**: Reduces window for connection hijacking

### Configuration Example

```json
{
  "timeouts": {
    "connection": 10,
    "command": 60,
    "idle": 900
  }
}
```

## Connection Pooling Security

### Pool Isolation
- **Rule**: Each MCP client session MUST have isolated connection pools
- **Rationale**: Prevents one client from reusing another client's authenticated sessions

### Pool Limits
- **maxConnections**: 1-10 per server (default: 3)
- **Purpose**: Prevent resource exhaustion attacks
- **Security impact**: Limits blast radius of compromised credentials

### Connection Reuse
- **reuseConnections**: true (default)
- **Security consideration**: Reused connections MUST verify client identity before each command
- **Cleanup**: Close all pooled connections on MCP client disconnect

## Network Security

### Transport Layer
- **MCP communication**: Stdio (local process) or HTTP (localhost only)
- **SSH communication**: Encrypted via SSH protocol (port 22 or custom)
- **Recommendation**: Never expose MCP server HTTP endpoint to public networks

### SSH Host Verification
- **MUST implement**: SSH host key verification
- **MUST reject**: Unknown or changed host keys (prevent MITM attacks)
- **Configuration**: Use `~/.ssh/known_hosts` or strict host key checking

## Audit Logging

### Log These Events
- ✅ Connection attempts (success/failure)
- ✅ Command executions (sanitized commands only)
- ✅ Authentication method used
- ✅ Timeout events
- ✅ Configuration reloads

### DO NOT Log
- ❌ Passwords
- ❌ Private keys
- ❌ Passphrases
- ❌ Full file paths with usernames
- ❌ Command output containing sensitive data

### Log Format

```json
{
  "timestamp": "2026-01-28T17:45:00Z",
  "level": "info",
  "event": "ssh_connection",
  "serverId": "prod-web-01",
  "authMethod": "privateKey",
  "result": "success",
  "duration": 1.2
}
```

## Incident Response

### Credential Compromise
1. **Immediate**: Revoke compromised SSH keys on all servers
2. **Rotate**: Generate new SSH keys with different passphrases
3. **Audit**: Review logs for unauthorized access
4. **Update**: Deploy new config with rotated credentials
5. **Restart**: Restart MCP server to clear old credentials from memory

### Unauthorized Access Detected
1. **Isolate**: Disconnect affected server from config
2. **Investigate**: Review audit logs for attack patterns
3. **Remediate**: Patch vulnerabilities, rotate credentials
4. **Monitor**: Increase logging verbosity temporarily

## Compliance Checklist

- [ ] Config file has 0600 permissions
- [ ] SSH private keys have 0600 permissions
- [ ] No credentials in log files
- [ ] Error messages sanitized (no passwords/keys)
- [ ] Timeouts configured (connection, command, idle)
- [ ] SSH host key verification enabled
- [ ] Connection pools isolated per MCP client
- [ ] Audit logging enabled
- [ ] Incident response plan documented

## References

- [SSH Protocol Security Best Practices](https://www.ssh.com/academy/ssh/protocol)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [CIS SSH Hardening Guidelines](https://www.cisecurity.org/)
