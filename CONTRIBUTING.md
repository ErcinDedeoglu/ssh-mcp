# Contributing

Thanks for considering a contribution!

## Development setup

```bash
git clone https://github.com/ErcinDedeoglu/ssh-mcp.git
cd ssh-mcp
bun install
bun run build
```

## Everyday commands

```bash
bun run test                  # unit tests (fast, mocked)
bun run test:e2e              # e2e tests - needs Docker, runs 8 shards
bun run test:e2e:sequential   # e2e in a single shard (debugging)
bun run lint                  # ESLint + Prettier + typecheck
```

E2E spins up three SSH server containers (password, key, key+passphrase auth) and
tears them down afterwards. Docker must be running.

## Architecture orientation

- `src/actions/` - shared business logic (no MCP imports) consumed by BOTH frontends
- `src/tools/` - thin MCP tool wrappers (zod schema + register)
- `src/cli/` - commander CLI (one-shot per invocation) + detached job runner
- `src/ssh/` - connection layer: SessionKeeper, shells, SFTP, forwards, jump hosts
- `AGENTS.md` files in each directory carry the detailed map - read them first

## Ground rules

- **200-line file limit** enforced by a custom ESLint rule - split files early.
- All imports use `.js` extensions (ES modules).
- Every user-facing error goes through `sanitizeError()` - never leak credentials,
  home paths, or key material.
- Config files must stay 0600; new config surfaces inherit the permission check.
- Add tests for new behavior: unit tests for logic, e2e for anything touching the
  SSH layer. CI runs the full matrix (ubuntu/macos/windows x node 22/24) plus
  dockerized e2e.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).

## Releasing

Maintainers: push a `v*` tag - CI verifies, publishes to npm via trusted
publishing (OIDC, no tokens), and creates the GitHub release. Release tags carry
a prebuilt `dist/` so git installs need no build scripts.

## Security

Report vulnerabilities via [SECURITY.md](docs/SECURITY.md) - do not open public issues.
