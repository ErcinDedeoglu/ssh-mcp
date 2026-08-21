# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Project configs (.ssh-mcp.json) may be git-tracked: permission check
  relaxes to no group/other WRITE (0644 after checkout is fine);
  central config still requires 0600
- No example server on first run: template config is an empty skeleton (zero
  servers); 'servers' prints a helpful empty state with a sample entry instead
- Central config now accepts zero servers (schema minItems dropped)
- Single-file bundled npm package: zero runtime dependencies, no install
  scripts, no npm 12 allow-scripts warnings, ~330kB tarball, sub-second installs

### Added

- New auth options: `"auth": { "agent": true }` (SSH agent / 1Password / Vault -
  zero secrets in config) and `~` expansion for key file paths
  (`"privateKey": "~/.ssh/id_ed25519"`). Known caveat: macOS Secure Keychain
  agent is incompatible with Node ssh2; use key files there.
- `ssh-mcp skill` command: prints the version-matched agent skill file; frontmatter version auto-injected from package.json
- Skill ships in the npm tarball and carries a Version Guard (refresh instructions)
- Project-level config overlay: `.ssh-mcp.json` discovered walking up from CWD,
  merges over central config (servers by id, keys, defaults); 0600 enforced;
  disabled by explicit --config/SSH_MCP_CONFIG; runtime state stays central
- `ssh-mcp update` self-update command (detects npm/bun, reinstalls latest)
- Update nudge on --help when a newer version exists

### Added

- Git-based install support:  (prepare script now builds dist/ on install)

## [1.3.0] - 2026-08-20

### Added

- Forced background auto-update: 24h-throttled registry check, detached silent install, never blocks commands
- Opt-out via SSH_MCP_AUTO_UPDATE=0; skipped for mcp/run-job/--json

## [1.1.4] - 2026-08-20

### Fixed

- Ship config.schema.json in the npm tarball (ENOENT crash on loadConfig)

### Changed

- Published to npm as ssh-mcp-cli (bin stays ssh-mcp)

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
