## Summary

<!-- What changed and why. Link issues: Fixes #123 -->

## Checklist

- [ ] `bun run lint` passes
- [ ] `bun run test` passes (unit)
- [ ] E2E touched SSH behavior: `bun run test:e2e:sequential` passes
- [ ] New behavior has tests
- [ ] No credentials, keys, or home paths in logs/errors (`sanitizeError` respected)
- [ ] Files stay under 200 lines
- [ ] Docs updated (README / CHANGELOG / AGENTS.md) if user-facing
