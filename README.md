# ssh-mcp

MCP server and CLI for SSH connection management and command execution. Define your servers once, use them from AI assistants or your terminal.

## Features

- **Dual-mode**: same binary runs as an MCP server (stdio) or a standalone CLI
- **Auto-connect**: Tools automatically connect when needed - no manual `connect` calls required
- Persistent SSH connections with keep-alive and auto-reconnection
- Persistent shell sessions - working directory and environment variables persist across commands
- Execute commands on remote servers
- **Background execution**: Run long commands asynchronously with job tracking
- Upload and download files via SFTP
- Local and remote port forwarding (including through jump hosts)
- Multi-server support with connection pooling
- Secure credential storage with 0600 permission validation

## Installation

```bash
npm install -g ssh-mcp-cli
ssh-mcp --help
```

Works with any package manager (`bun add -g ssh-mcp-cli`, `pnpm add -g ssh-mcp-cli`, `yarn global add ssh-mcp-cli`) and one-shot via `npx ssh-mcp-cli servers`.

### Auto-update

The CLI keeps itself current automatically: at most once per 24h it checks the npm registry in the background and, when a newer version exists, installs it via a detached process. The running command is never blocked or modified - the next invocation uses the new version.

- Opt out: `export SSH_MCP_AUTO_UPDATE=0` (also `false`/`no`/`off`)
- Never triggers in MCP server mode, background job runners, or `--json` invocations
- Check state: `~/.ssh-mcp/update-state.json` (next to your config)
- Manual update anytime: `ssh-mcp update`

Alternative while offline from npm - install from GitHub (release tags ship prebuilt `dist/`, no build scripts run):

```bash
bun add -g github:ErcinDedeoglu/ssh-mcp
```

Developing locally: clone, `bun install`, `bun run build`, then `npm link` to expose the `ssh-mcp` command.

**Requirements:** Node.js 22+ locally. Remote servers: Linux, macOS, Windows (bash/zsh, PowerShell, cmd.exe). Windows local caveat: `job cancel` / `forward-close` can't deliver cross-process signals, so they hard-terminate the runner/forward instead of a graceful shutdown.

## Configuration

By default, the config file is at `~/.ssh-mcp/config.json`. You can override this with:

| Method               | Example                                   |
| -------------------- | ----------------------------------------- |
| Environment variable | `SSH_MCP_CONFIG=~/.config/myapp/ssh.json` |
| CLI argument         | `--config ~/.config/myapp/ssh.json`       |

Priority: CLI arg > env var > default. The `~` expands to home directory on all platforms.

### Project-level config (`.ssh-mcp.json`)

Per-project server overrides: drop a `.ssh-mcp.json` in your project root (discovered walking up from the current directory, git-style). It merges over your central config:

- **servers** override by `id` — project entries win, new ids are appended
- **keys** merge by name, project wins
- **defaults** merge per-field
- shell-type persistence writes back to whichever file owns the server

```json
{ "servers": [ { "id": "staging", "host": "10.0.0.9", "port": 22, "username": "deploy", "auth": { "password": "..." } } ] }
```

Notes:
- Same rules as the central file: JSON Schema validated, **0600 permissions enforced** — `chmod 600 .ssh-mcp.json`
- **Add `.ssh-mcp.json` to `.gitignore`** if it contains credentials
- Explicit `--config` / `SSH_MCP_CONFIG` disables project discovery entirely
- Runtime state (jobs, forwards, update state) always stays in `~/.ssh-mcp/` — project dirs never accumulate runtime files

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
      "agentForward": true,
      "description": "Dev database (key from file, agent forwarding enabled)"
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

### SSH Agent Forwarding

Agent forwarding lets you use your local SSH keys on remote servers (e.g., for git with private repos).

**Two-level control:**

| Config `agentForward` | Tool `agentForward` | Result             |
| --------------------- | ------------------- | ------------------ |
| `true` (default)      | `true`              | Enabled            |
| `true` (default)      | `false`/omitted     | Disabled           |
| `false`               | any                 | Disabled (blocked) |

- **Config level**: Permission gate. Set `false` to block agent forwarding entirely for a server.
- **Tool level**: Request flag. Pass `true` to enable for that command.

```json
{
  "id": "restricted-server",
  "host": "prod.example.com",
  "username": "admin",
  "auth": { "privateKey": "~/.ssh/id_rsa" },
  "agentForward": false
}
```

```
execute(serverId, "git clone git@github.com:private/repo.git", { agentForward: true })
```

**Auto-recreate:** If you request `agentForward: true` but the existing shell lacks it, the shell is automatically recreated. This loses cwd and env vars. Response includes a `notice` when this happens:

```json
{ "stdout": "...", "exitCode": 0, "notice": "Shell recreated with agent forwarding enabled..." }
```

**Requirements:** SSH agent running with keys loaded (`ssh-add -l` to verify). The `SSH_AUTH_SOCK` environment variable must be set.

**Important:** Set file permissions to 0600:

```bash
chmod 600 ~/.ssh-mcp/config.json
```

## CLI Usage

The same binary is a standalone CLI. Running with no arguments starts the MCP server
(backwards compatible); pass any command to use the CLI:

```bash
ssh-mcp                        # MCP stdio server (no args = MCP mode)
ssh-mcp mcp                    # explicit MCP mode
ssh-mcp servers                # list configured servers
ssh-mcp exec prod-web uptime   # run a command, exit code propagates
ssh-mcp exec prod-web "systemctl status nginx" --json
ssh-mcp exec prod-web "npm install" --bg          # detached background job
ssh-mcp job check <jobId>                         # poll job status/output
ssh-mcp job cancel <jobId>
ssh-mcp upload prod-web ./app.tar.gz /tmp/
ssh-mcp download prod-web /var/log/app.log ./logs/
ssh-mcp status prod-web                           # connection health (auto-connects)
ssh-mcp jump bastion prod-db "hostname"            # run via jump host
ssh-mcp forward prod-db localhost 5432             # foreground tunnel, Ctrl-C stops
ssh-mcp rforward prod-web localhost 3000           # expose local service remotely
ssh-mcp forwards                                   # list CLI-managed forwards
```

Notes:

- Every command supports `--json` for structured output (handy for scripts and agents).
- `exec` joins arguments with spaces (like `ssh`); quote the command as one string when
  it contains shell operators: `ssh-mcp exec srv "sh -c 'exit 7'"`.
- Background jobs are persisted under `<config-dir>/jobs/` and survive across
  invocations; `job check` streams their output.
- MCP-only tools (`disconnect`, `get_console_history`) are session-scoped and have no
  CLI equivalent; CLI `exec` is one-shot per invocation.

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
| `execute_background`   | Run command in background, returns job ID               |
| `check_job`            | Check background job status and output                  |
| `cancel_job`           | Cancel a running background job (sends SIGINT)          |
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
Parameters: serverId, command, stdin (optional), timeout (optional), stallTimeout (optional),
            maxOutputLength (optional), agentForward (optional)
Returns: stdout, stderr, exitCode, truncated
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

**Stdin support:** Provide content to write to the command's stdin. Use this instead of heredocs for commands that read from stdin:

```
# Create a config file (replaces heredoc syntax)
execute(serverId, "cat > /etc/app.conf", { stdin: "key1=value1\nkey2=value2" })

# Execute a bash script
execute(serverId, "bash -s", { stdin: "#!/bin/bash\necho 'Hello from script'" })

# Process data with grep/awk/etc
execute(serverId, "grep -c ERROR", { stdin: logFileContent })
```

**Stall timeout:** By default, commands that produce no output for 10 seconds are considered stalled and terminated. For long-running commands (builds, package installs), pass `stallTimeout: 0` to disable stall detection:

```
execute(serverId, "apt upgrade -y", { stallTimeout: 0 })
execute(serverId, "npm install", { stallTimeout: 0 })
```

**Output truncation:** To prevent large outputs from overwhelming MCP clients, output is truncated to `maxOutputLength` characters (default: 10,000). When truncated, the response includes `truncated: true` and a notice showing total size:

```
execute(serverId, "cat large-file.log", { maxOutputLength: 50000 })
```

**Agent forwarding:** Pass `agentForward: true` to use your local SSH agent keys on the remote server:

```
execute(serverId, "git clone git@github.com:private/repo.git", { agentForward: true })
```

See [SSH Agent Forwarding](#ssh-agent-forwarding) for the two-level control system. If you request forwarding but the shell lacks it, it's auto-recreated (cwd/env lost).

### execute_background / check_job / cancel_job

For very long-running commands, use background execution to avoid blocking:

```
# Start command in background
execute_background(serverId, "npm run build")
→ { jobId: "job_abc123", status: "running" }

# Poll for status - output streams in real-time
check_job(jobId)
→ { status: "running", partialOutput: "Installing dependencies...",
    bytesReceived: 1024, elapsedMs: 5000, msSinceLastOutput: 200 }

check_job(jobId)
→ { status: "running", partialOutput: "Installing dependencies...\nBuilding...",
    bytesReceived: 2048, elapsedMs: 10000, msSinceLastOutput: 150 }

# Final result when complete
check_job(jobId)
→ { status: "completed", result: { stdout, exitCode }, durationMs: 15000 }

# Cancel if needed
cancel_job(jobId)
→ { status: "cancelled", interruptSent: true }
```

**Real-time streaming:** Output is available immediately as commands produce it - no waiting for completion. Progress indicators help track long-running jobs:

| Field               | Description                                    |
| ------------------- | ---------------------------------------------- |
| `partialOutput`     | Output received so far (streams in)            |
| `bytesReceived`     | Total bytes of output received                 |
| `elapsedMs`         | Time since job started                         |
| `msSinceLastOutput` | Time since last output chunk (stall detection) |

Background jobs run independently. Poll `check_job` to monitor progress and retrieve output.

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

### "Command stalled"

Commands that produce no output for 10 seconds are terminated with a stall error. For slow commands (builds, package managers), disable stall detection:

```
execute(serverId, "npm install", { stallTimeout: 0 })
```

Or use background execution for very long commands:

```
execute_background(serverId, "npm run build")
check_job(jobId)  # Poll for completion
```

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
npm run test:e2e              # Parallel with 8 shards (default)
npm run test:e2e:sequential   # Single shard for debugging
SHARDS=4 npm run test:e2e     # Custom shard count

# Run all tests
npm run test:all

# Build
npm run build

# Lint & typecheck
npm run lint
npm run typecheck
```

### Parallel E2E Tests

E2E tests run in parallel by default (8 shards). Each shard gets its own Docker Compose project with unique ports:

| Shard | ssh-server-1 | ssh-server-2 | ssh-server-key |
| ----- | ------------ | ------------ | -------------- |
| 0     | 2222         | 2223         | 2224           |
| 1     | 3222         | 3223         | 3224           |
| ...   | ...          | ...          | ...            |

| Shards | Docker | Health | Tests | Cleanup | Total |
| ------ | ------ | ------ | ----- | ------- | ----- |
| 1      | 0s     | 0s     | 103s  | 4s      | 107s  |
| 4      | 2s     | 1s     | 38s   | 5s      | 46s   |
| 8      | 5s     | 2s     | 27s   | 8s      | 42s   |
| 16     | 16s    | 2s     | 27s   | 12s     | 57s   |

Customize shard count: `SHARDS=4 npm run test:e2e` or `SHARDS=1 npm run test:e2e` for debugging.

## License

MIT
