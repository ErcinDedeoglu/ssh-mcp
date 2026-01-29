# ssh-mcp

MCP server for SSH connection management and command execution. Define your servers once, let AI assistants manage them.

## Features

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

Create the config file at `~/.ssh-mcp/config.json` (Linux/macOS) or `%USERPROFILE%\.ssh-mcp\config.json` (Windows):

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

## Claude Desktop Integration

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "command": "node",
      "args": ["/path/to/ssh-mcp/dist/index.js"]
    }
  }
}
```

Or if installed globally:

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

Restart Claude Desktop after configuration.

## Tools

**`execute` is the primary tool.** Use it for all shell operations: `ls`, `cat`, `mkdir`, `rm`, `chmod`, `grep`, `ps`, file I/O, etc. Other tools exist only for operations impossible via shell commands.

| Tool                   | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `list_servers`         | List configured servers (auto-reloads config) |
| `connect`              | Establish SSH connection                      |
| `disconnect`           | Close SSH connection                          |
| `execute`              | **Run any shell command**                     |
| `get_console_history`  | Retrieve previous command outputs             |
| `upload`               | SFTP upload (binary-safe, up to 100MB)        |
| `download`             | SFTP download (binary-safe, up to 100MB)      |
| `connection_status`    | Check connection health                       |
| `jump_connect`         | Connect through a jump host (bastion)         |
| `forward_port`         | Local port forward (access remote services)   |
| `forward_remote_port`  | Remote port forward (expose local services)   |
| `list_forwards`        | List active port forwards                     |
| `close_forward`        | Close a local port forward                    |
| `close_remote_forward` | Close a remote port forward                   |

### execute

**The core tool.** Runs any shell command on the remote server using a persistent shell session.

```
Parameters: serverId, command, timeout (optional)
Returns: stdout, stderr, exitCode
```

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

### connect / disconnect / connection_status

Connection lifecycle management. Protocol-level operations that can't be done via shell.

## Troubleshooting

### "Config file not found"

Create `~/.ssh-mcp/config.json` with at least one server defined.

### "Insecure file permissions"

Run `chmod 600 ~/.ssh-mcp/config.json` to restrict access.

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

- Config file requires 0600 permissions
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
