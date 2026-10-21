#!/usr/bin/env bash
# Netlify's ignore command (netlify.toml [build] ignore). Exit 0 cancels the
# build, exit 1 lets it run. A cancelled build isn't a deploy and costs no
# credits; every successful production deploy costs 15.
#
# It cancels one thing only: a production build whose changes since the last
# production build are all docs — docs/, .github/, or any .md file. None of
# those are read by `npm run build` or served (block-internal.js refuses them),
# so the deploy would publish the same site. Anything else builds, and so does
# every case where the answer is unclear: no previous commit to compare, the
# same commit again (a retry, "Clear cache and deploy", or the agent CMS's
# build hook republishing data), or a commit the clone doesn't have.
# Deploy previews and branch deploys are free, so they always build.

set -u

build() { echo "ignore-build: building — $1"; exit 1; }

[ "${CONTEXT:-}" = "production" ] || build "not a production build (${CONTEXT:-no context})"

from="${CACHED_COMMIT_REF:-}"
to="${COMMIT_REF:-HEAD}"

[ -n "$from" ] || build "no previous production build to compare with"
[ "$from" != "$to" ] || build "same commit as the last build (a retry or a build hook)"
git cat-file -e "${from}^{commit}" 2>/dev/null || build "the last built commit isn't in this clone"

changed=$(git diff --name-only "$from" "$to") || build "git diff failed"
[ -n "$changed" ] || build "no files changed"

site=$(printf '%s\n' "$changed" | grep -vE '^(docs/|\.github/)|\.md$')
if [ -n "$site" ]; then
  echo "ignore-build: site files changed since ${from:0:7}:"
  printf '%s\n' "$site" | head -20 | sed 's/^/  /'
  build "the site changed"
fi

echo "ignore-build: only docs changed since ${from:0:7} — skipping this production deploy:"
printf '%s\n' "$changed" | head -20 | sed 's/^/  /'
exit 0
