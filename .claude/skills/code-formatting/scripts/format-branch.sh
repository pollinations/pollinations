#!/bin/bash
# Format only files changed on the current branch compared to main
# Uses the same settings as the ci-pull-request-checks.yml workflow

set -e

# Get the base branch (default to main)
BASE_BRANCH="${1:-main}"

echo "🔍 Finding files changed compared to $BASE_BRANCH..."

# Get changed files (same pattern as workflow)
FILES=$(git diff --name-only "$BASE_BRANCH"...HEAD | grep -E '\.(js|ts|jsx|tsx|json|jsonc)$' || true)

if [ -z "$FILES" ]; then
    echo "✅ No JS/TS/JSON files changed on this branch"
    exit 0
fi

echo "📝 Changed files:"
echo "$FILES"
echo ""

echo "🔧 Running Biome format on changed files..."
echo "$FILES" | xargs npx biome check --write

echo ""
echo "✅ Done! Files formatted."
