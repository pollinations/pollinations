#!/usr/bin/env bash
set -euo pipefail
FILES=$(git diff --diff-filter=d --name-only origin/main...HEAD | grep -E '\.(js|ts|jsx|tsx|json|jsonc)$' | grep -v -E '(node_modules|dist|build|\.next|\.cache|out|package-lock\.json|secrets)/' | grep -v 'package-lock\.json$' || true)
echo "Changed files count: $(echo "$FILES" | grep -c . || true)"
if [ -n "$FILES" ]; then
  echo "$FILES" | xargs npx biome check --write
else
  echo "No matching changed files for Biome."
fi
echo '---STATUS AFTER BIOME---'
git status --porcelain
