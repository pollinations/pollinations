#!/usr/bin/env bash
# Quick health check for bees/code-bee without doing per-surface npm install.
# Verifies:
#   1. unit tests pass via node:test (no SDK install required — runner uses DI)
#   2. all *.ts parses
#   3. structural files exist (README.md, manifest.ts)
#
# This is a smoke test. The Claude Agent SDK is not installed; the runner
# accepts `query` as a function argument so unit tests substitute a fake.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1. Running unit tests"
mapfile -t TEST_FILES < <(
  find . -name '*.test.ts' ! -path './node_modules/*' | sort
)
node --experimental-strip-types --test "${TEST_FILES[@]}"

echo
echo "==> 2. Parse-checking all *.ts files"
fail=0
mapfile -t TS_FILES < <(
  find . -name '*.ts' ! -path './node_modules/*' | sort
)
for f in "${TS_FILES[@]}"; do
  rel=${f#./}
  if node --experimental-strip-types --check "$f" 2>/dev/null; then
    printf "  ok    %s\n" "$rel"
  else
    printf "  FAIL  %s\n" "$rel"
    fail=1
  fi
done

echo
echo "==> 3. Structural checks"
for required in README.md manifest.ts package.json src/runner.ts; do
  if [ ! -f "$required" ]; then
    printf "  FAIL  missing %s\n" "$required"
    fail=1
  fi
done

if [ $fail -ne 0 ]; then
  echo
  echo "smoke: FAILURES detected"
  exit 1
fi

echo
echo "smoke: ok"
