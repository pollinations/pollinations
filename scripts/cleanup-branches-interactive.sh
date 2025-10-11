#!/bin/bash

# Interactive Branch Cleanup Script for Pollinations
# Safely delete merged and stale branches with confirmation

set -e

REPO_DIR="${1:-.}"
cd "$REPO_DIR"

echo "🌸 Pollinations Interactive Branch Cleanup"
echo "=========================================="
echo ""

# Update remote references
echo "📡 Updating remote references..."
git fetch --prune
echo ""

# Function to confirm action
confirm() {
    read -p "$1 (y/N): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# 1. Clean up merged branches
echo "🔍 Finding merged branches..."
MERGED=$(git branch --merged main | grep -v "^\*\|main\|master" || true)

if [ -n "$MERGED" ]; then
    echo "Found merged branches:"
    echo "$MERGED" | sed 's/^/  /'
    echo ""
    
    if confirm "Delete all merged branches?"; then
        echo "$MERGED" | xargs -n 1 git branch -d
        echo "✅ Merged branches deleted"
    else
        echo "⏭️  Skipped merged branches"
    fi
else
    echo "✅ No merged branches to clean up"
fi
echo ""

# 2. Clean up branches tracking deleted remotes
echo "🔍 Finding branches tracking deleted remotes..."
GONE=$(git branch -vv | grep ': gone]' | awk '{print $1}' || true)

if [ -n "$GONE" ]; then
    echo "Found branches tracking deleted remotes:"
    echo "$GONE" | sed 's/^/  /'
    echo ""
    
    if confirm "Delete these branches?"; then
        echo "$GONE" | xargs -n 1 git branch -D
        echo "✅ Stale tracking branches deleted"
    else
        echo "⏭️  Skipped stale tracking branches"
    fi
else
    echo "✅ No stale tracking branches to clean up"
fi
echo ""

# 3. Show stale branches for manual review
echo "🔍 Finding stale branches (>6 months old, not merged)..."
SIX_MONTHS_AGO=$(date -v-6m +%Y-%m-%d 2>/dev/null || date -d '6 months ago' +%Y-%m-%d)
STALE=$(git for-each-ref --sort=-committerdate refs/heads/ --format='%(committerdate:short) %(refname:short)' | \
    awk -v date="$SIX_MONTHS_AGO" '$1 < date && $2 !~ /main|master/ {print $2}' || true)

if [ -n "$STALE" ]; then
    echo "Found stale branches (manual review recommended):"
    echo "$STALE" | sed 's/^/  /'
    echo ""
    echo "⚠️  These branches may contain unmerged work."
    echo "Review each branch before deleting:"
    echo ""
    
    for branch in $STALE; do
        echo "Branch: $branch"
        UNMERGED=$(git log main..$branch --oneline | wc -l | tr -d ' ')
        if [ "$UNMERGED" -gt 0 ]; then
            echo "  ⚠️  Has $UNMERGED unmerged commit(s)"
            git log main..$branch --oneline | head -3 | sed 's/^/    /'
            if [ "$UNMERGED" -gt 3 ]; then
                echo "    ... and $(($UNMERGED - 3)) more"
            fi
        else
            echo "  ✅ Fully merged (safe to delete)"
        fi
        
        if confirm "  Delete branch '$branch'?"; then
            git branch -D "$branch"
            echo "  ✅ Deleted"
        else
            echo "  ⏭️  Kept"
        fi
        echo ""
    done
else
    echo "✅ No stale branches found"
fi

echo ""
echo "🎉 Branch cleanup complete!"
echo ""
echo "Current branch count: $(git branch | wc -l | tr -d ' ')"
