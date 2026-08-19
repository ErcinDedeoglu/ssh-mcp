# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-20

### Added

- **Dual-mode binary**: `ssh-mcp` now works as both an MCP server and a standalone CLI
  - No arguments (or `mcp`) runs the MCP stdio server - fully backwards compatible
  - Any other arguments dispatch to the CLI (see `ssh-mcp --help`)
- CLI commands: `servers`, `exec` (with `--bg` background jobs), `job list/check/cancel`,
  `upload`, `download`, `status`, `jump`, `forward`, `rforward`, `forwards`,
  `forward-close`, `rforward-close`
- Global `--json` flag on all CLI commands for machine-readable (agent-friendly) output
- `exec` propagates the remote exit code as the process exit code
- Disk-backed job persistence (`<config-dir>/jobs/`) - background jobs survive across
  CLI invocations and are observable by both frontends
- Foreground port forwards (kubectl-style, Ctrl-C to stop) with cross-process tracking
  via `<config-dir>/forwards.json` (pid liveness based)

### Changed

- Internal refactor: tool business logic extracted into a shared actions layer
  (`src/actions/`) consumed by both MCP tools and CLI commands - single source of truth
- MCP tool responses and behavior are unchanged

## [1.0.0] - 2026-01-28

### Added
- Initial release
- MCP server with stdio transport
- 7 SSH management tools:
  - `list_servers` - List configured servers with connection status
  - `connect` - Establish SSH connection
  - `disconnect` - Close SSH connection
  - `execute` - Run shell commands
  - `upload` - Upload files via SFTP
  - `download` - Download files via SFTP
  - `connection_status` - Check connection health
- Persistent SSH connections with ssh2 library
- Keep-alive support (30s interval, 3 max failures)
- Auto-reconnection with exponential backoff (max 5 attempts)
- Idle timeout tracking (15 minutes default)
- JSON configuration with schema validation
- Support for password and SSH key authentication
- SFTP file transfer with 100MB size limit
- Security features:
  - Config file permission validation (0600)
  - Error message sanitization (no credentials in output)
  - Path sanitization in error messages
- Comprehensive test suite (115 tests)
- Claude Desktop integration support
