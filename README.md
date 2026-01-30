# ssh-mcp

MCP server for SSH connection management and command execution. Define your servers once, let AI assistants manage them.

## Features

- **Auto-connect**: Tools automatically connect when needed - no manual `connect` calls required
- Persistent SSH connections with keep-alive and auto-reconnection
- Persistent shell sessions - working directory and environment variables persist across commands
- Execute commands on remote servers
- Upload and download files via SFTP
- Multi-server support with connection pooling
- Secure credential storage with 0600 permission validation

## Installation

```bash
npm install ssh-mcp
```

**Requirements:** Node.js 22+

## Configuration

By default, the config file is at `~/.ssh-mcp/config.json`. You can override this with:

| Method               | Example                                   |
| -------------------- | ----------------------------------------- |
| Environment variable | `SSH_MCP_CONFIG=~/.config/myapp/ssh.json` |
| CLI argument         | `--config ~/.config/myapp/ssh.json`       |

Priority: CLI arg > env var > default. The `~` expands to home directory on all platforms.

### Config file format

```json
{
  "keys": {
    "main-key": "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNza...(key content)...\n-----END OPENSSH PRIVATE KEY-----"
  },
  "servers": [
    {
      "id": "prod-web",
      "host": "192.168.1.100",
      "port": 22,
      "username": "ubuntu",
      "auth": {
        "privateKey": "main-key"
      },
      "description": "Production web server (key alias)"
    },
    {
      "id": "prod-api",
      "host": "api.example.com",
      "port": 22,
      "username": "deploy",
      "auth": {
        "privateKey": "main-key"
      },
      "description": "Production API server (same key alias)"
    },
    {
      "id": "dev-db",
      "host": "dev.example.com",
      "port": 22,
      "username": "admin",
      "auth": {
        "privateKey": "~/.ssh/id_rsa"
      },
      "description": "Dev database (key from file)"
    }
  ],
  "defaults": {
    "timeouts": {
      "connection": 10,
      "command": 60,
      "idle": 900
    }
  }
}
```

### privateKey formats

The `privateKey` field auto-detects format:

| Format     | Detection                        | Example                                      |
| ---------- | -------------------------------- | -------------------------------------------- |
| Inline PEM | Starts with `-----BEGIN`         | `"-----BEGIN OPENSSH PRIVATE KEY-----\n..."` |
| Key alias  | Matches a name in `keys` section | `"main-key"`                                 |
| File path  | Everything else                  | `"~/.ssh/id_rsa"`                            |

Use the `keys` section to define a key once and reference it by alias across multiple servers.

**Important:** Set file permissions to 0600:

```bash
chmod 600 ~/.ssh-mcp/config.json
```

## MCP Client Integration

### Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "command": "npx",
      "args": ["ssh-mcp"]
    }
  }
}
```

With custom config path:

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "command": "npx",
      "args": ["ssh-mcp"],
      "env": {
        "SSH_MCP_CONFIG": "~/.config/claude/ssh-mcp.json"
      }
    }
  }
}
```

### OpenCode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "ssh-mcp": {
      "type": "local",
      "command": ["npx", "ssh-mcp"],
      "environment": {
        "SSH_MCP_CONFIG": "~/.config/opencode/ssh-mcp.json"
      }
    }
  }
}
```

Restart the MCP client after configuration.

## Tools

**`execute` is the primary tool.** Use it for all shell operations: `ls`, `cat`, `mkdir`, `rm`, `chmod`, `grep`, `ps`, file I/O, etc. Other tools exist only for operations impossible via shell commands.

| Tool                   | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `list_servers`         | List configured servers (auto-reloads config)           |
| `disconnect`           | Close SSH connection                                    |
| `execute`              | **Run any shell command** (auto-connects)               |
| `get_console_history`  | Retrieve previous command outputs                       |
| `upload`               | SFTP upload (binary-safe, up to 100MB, auto-connects)   |
| `download`             | SFTP download (binary-safe, up to 100MB, auto-connects) |
| `connection_status`    | Check connection health (auto-connects)                 |
| `jump_connect`         | Connect through jump host (auto-connects jump host)     |
| `forward_port`         | Local port forward (auto-connects)                      |
| `forward_remote_port`  | Remote port forward (auto-connects)                     |
| `list_forwards`        | List active port forwards                               |
| `close_forward`        | Close a local port forward                              |
| `close_remote_forward` | Close a remote port forward                             |

### execute

**The core tool.** Runs any shell command on the remote server using a persistent shell session. Automatically connects if not already connected.

```
Parameters: serverId, command, timeout (optional)
Returns: stdout, stderr, exitCode
```

**Auto-connect:** Just call `execute` - the server connects automatically on first use. No need to call `connect` first.

**State persistence:** Working directory (`cd`) and environment variables (`export`) persist across multiple execute calls on the same server. This allows natural workflows like:

```
execute("cd /var/log")
execute("grep error app.log")   # runs in /var/log
execute("export DEBUG=1")
execute("./run-tests.sh")       # sees DEBUG=1
```

Shell sessions are automatically destroyed on disconnect.

### get_console_history

Retrieve previous command outputs from the shell session. Useful for reviewing what happened or checking outputs from earlier commands.

```
Parameters: serverId, limit (optional, default: all)
Returns: Array of { timestamp, command, stdout, exitCode, durationMs }
```

**Limits:** 100 entries max per server, 50KB max per output (truncated if larger). History is cleared on disconnect.

### upload / download

Use only for binary files or files >10MB. For text files, prefer `execute` with `cat`/`echo`.

```
Parameters: serverId, localPath, remotePath
Limits: 100MB max
```

### list_servers

Lists all configured servers with their connection status. **Automatically reloads config** from disk on each call, so you can edit `~/.ssh-mcp/config.json` and see changes immediately without restarting.

```
Returns: Array of { id, host, port, username, connected, description? }
```

### disconnect / connection_status

Connection lifecycle management. Protocol-level operations that can't be done via shell. Note that `connection_status` will auto-connect if not already connected.

## Troubleshooting

### "Config file not found"

A template config is auto-generated at the specified path. Edit it with your servers and restart.

### "Insecure file permissions"

Run `chmod 600 <config-path>` to restrict access. This check is skipped on Windows.

### "Authentication failed"

- For key auth: Verify key path and permissions (0600)
- For password auth: Check credentials
- Verify the username is correct

### "Connection timeout"

- Check network connectivity to the host
- Verify the host and port are correct
- Check firewall rules

### "Command timeout"

Increase the timeout in config or pass `timeout` parameter to execute.

### Connection drops frequently

The server uses keep-alive (30s interval) and auto-reconnection (5 attempts with exponential backoff). If issues persist, check network stability.

## Security

See [SECURITY.md](./SECURITY.md) for:

- Threat model
- Credential handling best practices
- Error sanitization rules

**Key points:**

- Config file requires 0600 permissions (Linux/macOS only)
- Credentials never appear in logs or error messages
- SSH keys are recommended over passwords

## Development

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Run E2E tests (requires Docker - handles setup/cleanup automatically)
npm run test:e2e

# Run all tests
npm run test:all

# Build
npm run build

# Lint & typecheck
npm run lint
npm run typecheck
```

## License

MIT
