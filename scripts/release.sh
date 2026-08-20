#!/usr/bin/env bash
# Release helper: builds dist/ and commits it into the release tag so git
# installs need no lifecycle scripts (works with bun/npm/pnpm as-is).
# The dist/ commit lives only in the tag; the branch stays clean.
#
# Usage:
#   ./scripts/release.sh patch|minor|major   # bumps, commits dist, tags, pushes
set -euo pipefail

BUMP="${1:-patch}"
BRANCH="$(git branch --show-current)"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Working tree has uncommitted changes - commit first." >&2
  exit 1
fi

bun run lint
bun run test
bun run build

npm version "$BUMP" --no-git-tag-version
VERSION="v$(node -p "require('./package.json').version")"
git add package.json
git commit -m "chore: release $VERSION"
git push origin "$BRANCH"

# Tag a snapshot that includes the prebuilt dist/ (branch itself stays clean)
git checkout --detach
git add -f dist
git commit -m "chore: include dist/ in $VERSION (git installs need no build scripts)"
git tag "$VERSION"
git push origin "refs/tags/$VERSION"

git checkout "$BRANCH"

echo "Released $VERSION (dist/ committed in tag only)"
