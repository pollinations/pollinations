#!/bin/bash

# Delete Merged Branches (Local + Remote)
# Safely removes branches that are fully merged into master/main

set -e

REPO_DIR="${1:-.}"
cd "$REPO_DIR"

echo "🌸 Pollinations - Delete Merged Branches"
echo "========================================="
echo ""

# Function to confirm action
confirm() {
    read -p "$1 (y/N): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# Update remote references
echo "📡 Updating remote references..."
git fetch --prune
echo ""

# Get current branch to avoid deleting it
CURRENT_BRANCH=$(git branch --show-current)

# Detect default branch (master or main)
DEFAULT_BRANCH=$(git remote show origin | grep "HEAD branch" | cut -d ":" -f 2 | tr -d ' ')
echo "ℹ️  Default branch: $DEFAULT_BRANCH"
echo "ℹ️  Current branch: $CURRENT_BRANCH"
echo ""

# 1. Delete local merged branches
echo "🔍 Finding locally merged branches..."
MERGED_LOCAL=$(git branch --merged $DEFAULT_BRANCH | grep -v "^\*\|main\|master\|$CURRENT_BRANCH" || true)

if [ -n "$MERGED_LOCAL" ]; then
    LOCAL_COUNT=$(echo "$MERGED_LOCAL" | wc -l | tr -d ' ')
    echo "Found $LOCAL_COUNT merged local branches:"
    echo "$MERGED_LOCAL" | sed 's/^/  /'
    echo ""
    
    if confirm "Delete these $LOCAL_COUNT local branches?"; then
        echo ""
        echo "🗑️  Deleting local merged branches..."
        DELETED=0
        while IFS= read -r branch; do
            branch=$(echo "$branch" | xargs)  # trim whitespace
            if [ -n "$branch" ]; then
                echo "  ✓ Deleting: $branch"
                git branch -d "$branch"
                DELETED=$((DELETED + 1))
            fi
        done <<< "$MERGED_LOCAL"
        echo ""
        echo "✅ Deleted $DELETED local branches"
    else
        echo "⏭️  Skipped local branch deletion"
    fi
else
    echo "✅ No merged local branches to delete"
fi
echo ""

# 2. Delete remote merged branches
echo "🔍 Finding remotely merged branches..."
MERGED_REMOTE=$(git branch -r --merged $DEFAULT_BRANCH | grep -v "main\|master\|HEAD" | sed 's/origin\///' || true)

if [ -n "$MERGED_REMOTE" ]; then
    REMOTE_COUNT=$(echo "$MERGED_REMOTE" | wc -l | tr -d ' ')
    echo "Found $REMOTE_COUNT merged remote branches:"
    echo "$MERGED_REMOTE" | sed 's/^/  origin\//'
    echo ""
    
    echo "⚠️  WARNING: This will delete branches from GitHub!"
    if confirm "Delete these $REMOTE_COUNT remote branches?"; then
        echo ""
        echo "🗑️  Deleting remote merged branches..."
        DELETED=0
        while IFS= read -r branch; do
            branch=$(echo "$branch" | xargs)  # trim whitespace
            if [ -n "$branch" ]; then
                echo "  ✓ Deleting: origin/$branch"
                if git push origin --delete "$branch" 2>&1 | grep -q "deleted"; then
                    DELETED=$((DELETED + 1))
                fi
            fi
        done <<< "$MERGED_REMOTE"
        echo ""
        echo "✅ Deleted $DELETED remote branches"
    else
        echo "⏭️  Skipped remote branch deletion"
    fi
else
    echo "✅ No merged remote branches to delete"
fi
echo ""

# 3. Clean up stale tracking branches
echo "🧹 Cleaning up stale tracking references..."
git remote prune origin
echo ""

# 4. Summary
echo "🎉 Cleanup Complete!"
echo "==================="
REMAINING_LOCAL=$(git branch | wc -l | tr -d ' ')
REMAINING_REMOTE=$(git branch -r | grep -v "HEAD" | wc -l | tr -d ' ')
echo "Remaining local branches: $REMAINING_LOCAL"
echo "Remaining remote branches: $REMAINING_REMOTE"
