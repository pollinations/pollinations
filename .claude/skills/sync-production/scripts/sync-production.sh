#!/bin/bash
# Merge main into production via the GitHub merges API.
# Pre-checks for conflicts with git merge-tree before attempting the merge.
# Exits non-zero with a clear reason if the merge would conflict.

set -euo pipefail

REPO="${SYNC_REPO:-pollinations/pollinations}"
BASE="${SYNC_BASE:-production}"
HEAD="${SYNC_HEAD:-main}"

echo "→ Fetching origin/$BASE and origin/$HEAD..."
git fetch --quiet origin "$BASE" "$HEAD"

# Pin to the SHAs we fetched so the pre-check and the API call agree
# even if origin/$HEAD advances between them.
HEAD_SHA=$(git rev-parse "origin/$HEAD")
BASE_SHA=$(git rev-parse "origin/$BASE")

ahead=$(git rev-list --count "$BASE_SHA..$HEAD_SHA")
if [ "$ahead" -eq 0 ]; then
  echo "✓ origin/$BASE is already up to date with origin/$HEAD. Nothing to merge."
  exit 0
fi

echo "→ $ahead commit(s) to merge from $HEAD ($HEAD_SHA) into $BASE:"
git log --oneline "$BASE_SHA..$HEAD_SHA" | sed 's/^/    /'

echo ""
echo "→ Pre-checking for merge conflicts (git merge-tree, no working tree)..."
set +e
conflict_output=$(git merge-tree --write-tree --name-only --no-messages "$BASE_SHA" "$HEAD_SHA" 2>&1)
merge_ec=$?
set -e

if [ "$merge_ec" -ne 0 ]; then
  echo ""
  echo "✗ Merge would conflict. Refusing to merge."
  echo ""
  echo "Conflicting paths:"
  # First line of output is the conflicted tree OID; the rest are paths
  # (--no-messages suppresses the trailing "Auto-merging"/"CONFLICT" notices).
  echo "$conflict_output" | tail -n +2 | sed 's/^/    /'
  echo ""
  echo "Resolve manually:"
  echo "  git checkout $BASE && git pull"
  echo "  git merge $HEAD     # resolve in editor"
  echo "  git push origin $BASE"
  exit 2
fi

echo "✓ Clean merge."
echo ""
echo "→ Calling GitHub merges API for $REPO ($HEAD_SHA → $BASE)..."

set +e
response=$(gh api -X POST "repos/$REPO/merges" \
  -f base="$BASE" \
  -f head="$HEAD_SHA" \
  -f commit_message="Merge branch '$HEAD' into $BASE" 2>&1)
api_ec=$?
set -e

if [ "$api_ec" -ne 0 ]; then
  echo "✗ GitHub merges API call failed:"
  echo "$response" | sed 's/^/    /'
  exit 3
fi

sha=$(echo "$response" | jq -r '.sha // empty' 2>/dev/null || true)
if [ -n "$sha" ]; then
  echo "✓ Merged. New commit on $BASE: $sha"
  echo "  https://github.com/$REPO/commit/$sha"
else
  echo "$response"
fi
