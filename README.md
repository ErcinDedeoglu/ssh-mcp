# ssh-mcp

MCP server for SSH connection management and command execution. Define your servers once, let AI assistants manage them.

## Features

- Persistent SSH connections with keep-alive and auto-reconnection
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

Create `~/.ssh-mcp/config.json`:

```json
{
  "servers": [
    {
      "id": "prod-web",
      "host": "192.168.1.100",
      "port": 22,
      "username": "ubuntu",
      "auth": {
        "privateKey": "~/.ssh/id_rsa"
      },
      "description": "Production web server"
    },
    {
      "id": "dev-db",
      "host": "dev.example.com",
      "port": 22,
      "username": "admin",
      "auth": {
        "password": "your-password"
      }
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

### list_servers
List all configured SSH servers with their connection status.

### connect
Connect to an SSH server. Reuses existing connection if already connected.

**Parameters:**
- `serverId` (required): Unique identifier of the server

### disconnect
Close an SSH connection to a server.

**Parameters:**
- `serverId` (required): Unique identifier of the server

### execute
Execute a shell command on a connected SSH server.

**Parameters:**
- `serverId` (required): Server to execute on
- `command` (required): Shell command to run
- `timeout` (optional): Command timeout in seconds

**Returns:** stdout, stderr, exitCode

### upload
Upload a file to a connected SSH server via SFTP.

**Parameters:**
- `serverId` (required): Target server
- `localPath` (required): Absolute path to local file
- `remotePath` (required): Destination path (supports ~)

**Limits:** Maximum file size 100MB

### download
Download a file from a connected SSH server via SFTP.

**Parameters:**
- `serverId` (required): Source server
- `remotePath` (required): Path on remote server (supports ~)
- `localPath` (required): Local destination path

**Limits:** Maximum file size 100MB

### connection_status
Check the health and status of an SSH connection.

**Parameters:**
- `serverId` (required): Server to check

**Returns:** connected, idle, reconnecting status, last activity

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
