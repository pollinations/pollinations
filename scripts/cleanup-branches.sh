#!/bin/bash

# Branch Cleanup Analysis Script for Pollinations
# This script helps identify branches that can be safely deleted

set -e

REPO_DIR="${1:-.}"
cd "$REPO_DIR"

echo "🌸 Pollinations Branch Cleanup Analysis"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Update remote references
echo "📡 Updating remote references..."
git fetch --prune
echo ""

# 1. Merged branches (safe to delete)
echo -e "${GREEN}✅ MERGED BRANCHES (Safe to delete):${NC}"
echo "These branches are fully merged into main:"
MERGED=$(git branch --merged main | grep -v "^\*\|main\|master" || true)
if [ -z "$MERGED" ]; then
    echo "  None found"
else
    echo "$MERGED" | sed 's/^/  /'
    MERGED_COUNT=$(echo "$MERGED" | wc -l | tr -d ' ')
    echo ""
    echo "  Total: $MERGED_COUNT branches"
fi
echo ""

# 2. Stale branches (>6 months old, not merged)
echo -e "${YELLOW}⚠️  STALE BRANCHES (>6 months, not merged):${NC}"
echo "Review these manually - may contain unmerged work:"
SIX_MONTHS_AGO=$(date -v-6m +%Y-%m-%d 2>/dev/null || date -d '6 months ago' +%Y-%m-%d)
STALE=$(git for-each-ref --sort=-committerdate refs/heads/ --format='%(committerdate:short) %(refname:short)' | \
    awk -v date="$SIX_MONTHS_AGO" '$1 < date && $2 !~ /main|master/ {print $1, $2}' || true)
if [ -z "$STALE" ]; then
    echo "  None found"
else
    echo "$STALE" | sed 's/^/  /'
    STALE_COUNT=$(echo "$STALE" | wc -l | tr -d ' ')
    echo ""
    echo "  Total: $STALE_COUNT branches"
fi
echo ""

# 3. Remote branches that are gone
echo -e "${RED}🗑️  REMOTE BRANCHES DELETED (local refs to clean):${NC}"
GONE=$(git branch -vv | grep ': gone]' | awk '{print $1}' || true)
if [ -z "$GONE" ]; then
    echo "  None found"
else
    echo "$GONE" | sed 's/^/  /'
    GONE_COUNT=$(echo "$GONE" | wc -l | tr -d ' ')
    echo ""
    echo "  Total: $GONE_COUNT branches"
fi
echo ""

# 4. Summary
echo "📊 SUMMARY"
echo "=========="
TOTAL_BRANCHES=$(git branch | wc -l | tr -d ' ')
echo "Total local branches: $TOTAL_BRANCHES"
echo ""

# 5. Suggested commands
echo "🔧 SUGGESTED CLEANUP COMMANDS"
echo "=============================="
echo ""
echo "1. Delete merged branches (safest):"
echo "   git branch --merged main | grep -v '^\*\|main\|master' | xargs -n 1 git branch -d"
echo ""
echo "2. Delete branches tracking deleted remotes:"
echo "   git branch -vv | grep ': gone]' | awk '{print \$1}' | xargs -n 1 git branch -D"
echo ""
echo "3. Review and manually delete stale branches:"
echo "   git branch -d <branch-name>  # Safe delete (only if merged)"
echo "   git branch -D <branch-name>  # Force delete (use with caution)"
echo ""
echo "4. Delete remote branches (if you have permission):"
echo "   git push origin --delete <branch-name>"
echo ""
echo "⚠️  Always verify before deleting! Use 'git log main..branch-name' to check unmerged commits."
