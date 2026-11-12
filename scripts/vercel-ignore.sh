#!/usr/bin/env bash
# Vercel's "Ignored Build Step". Exit 0 skips the build, exit 1 builds.
#
# James (2026-11-12): we are running out of Vercel builds and money. Every push to a branch
# built two previews (the app and the website) that nobody opened, since CI runs the checks,
# and every merge rebuilt both projects even when only the iPhone app changed. So:
#   1. Only `main` builds. Branch pushes make no preview.
#   2. On `main`, a project builds only when a file it is built from changed.
# Any doubt (no previous commit, a git error) builds, never skips.
#
# Usage: vercel-ignore.sh app | site
set -u

if [ "${VERCEL_GIT_COMMIT_REF:-}" != "main" ]; then
  echo "Branch ${VERCEL_GIT_COMMIT_REF:-unknown}: no preview build."
  exit 0
fi

cd "$(git rev-parse --show-toplevel)" || exit 1

case "${1:-}" in
  app)
    paths="apps/prototype packages content api scripts package.json package-lock.json vercel.json tsconfig.base.json tsconfig.api.json"
    ;;
  site)
    paths="apps/site packages/echo docs/privacy-policy.md docs/refund-policy.md docs/terms-of-service.md package.json package-lock.json"
    ;;
  *)
    echo "Unknown project '${1:-}': building."
    exit 1
    ;;
esac

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  base="HEAD^"
fi

# shellcheck disable=SC2086
git diff --quiet "$base" HEAD -- $paths
status=$?
if [ "$status" -eq 0 ]; then
  echo "Nothing the $1 is built from changed since ${base}: skipping."
  exit 0
fi
echo "The $1 changed (or git could not tell): building."
exit 1
