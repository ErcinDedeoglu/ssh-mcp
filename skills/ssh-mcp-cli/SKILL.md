---
name: ssh-mcp-cli
version: 1.4.0
description: ssh-mcp CLI — MUST USE when the user mentions SSH, ssh-mcp, remote servers, or asks to run commands on, upload/download files to, check status of, or port-forward to remote/server machines via the ssh-mcp tool. Covers exec (foreground + background jobs), SFTP transfers, connection status, jump hosts, port forwarding, and server config discovery.
requires:
  bins: ["ssh-mcp"]
---

# ssh-mcp CLI Usage Guide

Run commands, transfer files, and forward ports on user-configured SSH servers via `ssh-mcp`. Servers are defined in config (`~/.ssh-mcp/config.json`, plus optional per-project `.ssh-mcp.json` overlay) — never ask the user for host/credentials; discover server IDs with `ssh-mcp servers`.

## Agent Guidance

### Key Principles

- **Always discover first.** `ssh-mcp servers --json` lists available server IDs with host/user. If the user's target isn't listed, show them the list — don't invent servers.
- **Use `--json` for parsing.** Every command supports it; human mode is for display only.
- **`exec` joins arguments with spaces (like `ssh`).** For shell operators, pipes, or quotes, pass the command as ONE quoted string: `ssh-mcp exec srv "sh -c 'exit 7'"`.
- **Exit code = remote exit code.** Non-zero means the remote command failed — check `stderr` in the JSON payload, don't retry blindly.
- **Long-running or silent commands**: add `--stall-timeout 0` (disables the 10s no-output timeout). For commands >5min, use background jobs (below).
- **Errors are structured.** `server_not_found` → re-run `servers`. `connection_failed` → host/port issue, surface the `reason`. Never print config contents (contains credentials).

### Command Reference

```bash
ssh-mcp servers [--json]                     # list servers: id, host, port, username, connected
ssh-mcp status <id> [--json]                 # connection health (auto-connects)
  # → connected, idle, idleWarning, reconnecting, reconnectAttempt,
  #   lastActivityMs, lastActivityAgo (human string)
ssh-mcp exec <id> <cmd...> [--json]          # run command; exit code propagates
  --timeout <sec>                            # command timeout (default 60)
  --stall-timeout <sec>                      # 0 = allow silent long-runners
  --max-output <chars>                       # truncate stdout beyond N chars (default 10000)
  --stdin                                    # pipe local stdin to remote command
  --bg [--stall-timeout 0]                   # detach as background job → prints jobId
  --agent-forward                            # forward local SSH agent (git pulls etc.)
ssh-mcp job list [serverId] [--json]         # list jobs (status + runner liveness)
ssh-mcp job check <jobId> [--json]           # poll: status, partialOutput, result, elapsedMs
  [--max-output <chars>]
ssh-mcp job cancel <jobId>                   # SIGTERM the runner
ssh-mcp upload <id> <local> <remote>         # SFTP up (100MB limit, ~ supported)
ssh-mcp download <id> <remote> <local>       # SFTP down
ssh-mcp jump <jumpId> <targetId> [cmd...]    # connect via bastion, optional command
ssh-mcp forward <id> <remoteHost> <remotePort>   # foreground tunnel
  [--local-host <iface>] [--local-port <port>]   # defaults: 127.0.0.1, auto-assign
  [--via <jumpId>]                               # tunnel through bastion
ssh-mcp rforward <id> <localHost> <localPort>    # expose local service remotely
  [--remote-host <iface>] [--remote-port <port>] # bind on server (defaults 127.0.0.1, auto)
ssh-mcp forwards [--json]                    # list CLI-managed tunnels (kind, route, pid)
ssh-mcp forward-close <localPort> [--local-host <iface>]   # stop a local tunnel
ssh-mcp rforward-close <id> <remotePort> [--remote-host <iface>]  # stop a remote tunnel
ssh-mcp update [--json]                      # manual self-update (also auto-updates 1x/24h)
```

### Background Job Pattern (>5min tasks)

```bash
ssh-mcp exec build-srv "npm run build" --bg --stall-timeout 0   # → "Job started: job_xxx"
ssh-mcp job check job_xxx --json                                  # poll status/partialOutput
# status: pending → running → completed | failed | cancelled
# when completed: result.stdout, result.exitCode are authoritative
ssh-mcp job check job_xxx --json | jq '.result.exitCode'
```
Poll every 10-30s (not in a tight loop). Jobs survive the CLI exiting; `msSinceLastOutput` high + status `running` may mean a stall.

### Common Workflows

- **Diagnose a server**: `status` → `exec <id> "uptime && df -h"` (chained, one string)
- **Read a remote file**: `ssh-mcp exec <id> "cat /var/log/app.log" --json | jq -r .stdout`
- **Write a remote file**: `printf 'content' | ssh-mcp exec <id> "cat > /path/file" --stdin`
- **Deploy**: `upload` artifact → `exec` "systemctl restart x" → `exec` "systemctl is-active x"
- **DB access**: `ssh-mcp forward db-srv localhost 5432 --local-port 15432 &` then connect to `localhost:15432`; stop with `forward-close 15432`
- **Private network via bastion**: `jump` for one-shots; `forward --via <jumpId>` for tunnels

### Config Facts

- Central: `~/.ssh-mcp/config.json` (0600 enforced). Project overlay: `.ssh-mcp.json` walked up from CWD — servers override by id, keys/defaults merge; disabled when config is pinned.
- `SSH_MCP_CONFIG=<path>` env or `--config <path>` pin the config explicitly.
- One-shot per invocation: no cwd/env persistence between `exec` calls. Chain with `&&` in one quoted command when state matters.
- Self-updates automatically at most once/24h (background, never blocks). Opt out: `SSH_MCP_AUTO_UPDATE=0`. State: `~/.ssh-mcp/update-state.json`.
- No `ssh-mcp` binary? `npm install -g ssh-mcp-cli` (package name differs from bin name).

### Hard Limits

- File transfer: 100MB (`upload`/`download`). Larger: `exec` with split/base64.
- `exec` output: truncated to 10MB; use `--max-output <chars>` or remote-side filtering (`| tail`, `grep`).
- Forwards run in the foreground of their own process — background the shell command or use a separate terminal.
