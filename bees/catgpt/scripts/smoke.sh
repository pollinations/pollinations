#!/usr/bin/env bash
# Quick health check for bees/catgpt without doing per-variant npm install.
# Verifies:
#   1. core/ + surface tests pass via node:test
#   2. each variant's *.ts parses (node --experimental-strip-types --check)
#   3. structural files exist (README.md, package.json, src/agent.ts)
#
# This is a smoke test, not a full typecheck — that needs the SDKs installed.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1. Running pure-function tests"
# Auto-discover *.test.ts under core/ and surfaces/ (excludes live.test.ts).
mapfile -t TEST_FILES < <(
  find core surfaces -name '*.test.ts' ! -name 'live.test.ts' | sort
)
node --experimental-strip-types --test "${TEST_FILES[@]}"

echo
echo "==> 2. Live tests (skipped unless POLLINATIONS_LIVE=1 + token)"
node --experimental-strip-types --test core/live.test.ts || true

echo
echo "==> 3. Parse-checking each variant's *.ts files"
fail=0
for dir in implementations/*/; do
  variant=$(basename "$dir")
  for f in "$dir"src/*.ts; do
    [ -f "$f" ] || continue
    if node --experimental-strip-types --check "$f" 2>/dev/null; then
      printf "  ok    %-25s %s\n" "$variant" "$(basename "$f")"
    else
      printf "  FAIL  %-25s %s\n" "$variant" "$(basename "$f")"
      fail=1
    fi
  done
done

echo
echo "==> 4. Structural checks"
for dir in implementations/*/; do
  variant=$(basename "$dir")
  for required in README.md package.json src/agent.ts; do
    if [ ! -f "$dir/$required" ]; then
      printf "  FAIL  %-25s missing %s\n" "$variant" "$required"
      fail=1
    fi
  done
done

if [ $fail -ne 0 ]; then
  echo
  echo "smoke: FAILURES detected"
  exit 1
fi

echo
echo "smoke: ok"
