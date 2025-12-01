#!/bin/bash
# Quick branch analysis script
# Usage: ./scripts/analyze-branches.sh

set -e

echo "==================================="
echo "Branch Analysis for pollinations"
echo "==================================="
echo ""

# Ensure we have latest data
echo "Fetching latest branch information..."
git fetch --all --prune > /dev/null 2>&1

# Total branches
total=$(git branch -r | grep -v '\->' | wc -l)
echo "Total remote branches: $total"
echo ""

# Protected branches (should never be deleted)
echo "Protected branches:"
git branch -r | grep -v '\->' | sed 's/origin\///' | grep -E '^(main|master|develop|staging|production)$' | sed 's/^/  - /' || echo "  - main"
echo ""

# Issue-numbered branches (e.g., 123-feature-name)
issue_count=$(git branch -r | grep -v '\->' | grep -E 'origin/[0-9]+-' | wc -l)
echo "Issue-numbered branches: $issue_count"
echo "  (Usually from PRs - check if merged before deleting)"
echo ""

# Feature/fix/hotfix branches
feature_count=$(git branch -r | grep -v '\->' | grep -E 'origin/(feature|fix|hotfix|bugfix)/' | wc -l)
echo "Feature/fix branches: $feature_count"
echo ""

# Copilot branches
copilot_count=$(git branch -r | grep -v '\->' | grep -E 'origin/copilot/' | wc -l)
echo "Copilot branches: $copilot_count"
echo ""

# Add-* branches (usually project additions)
add_count=$(git branch -r | grep -v '\->' | grep -E 'origin/add-' | wc -l)
echo "Add-* branches: $add_count"
echo ""

# Recent branches (last 30 days) - sample analysis
if [ "$total" -gt 10 ]; then
  echo "Analyzing recent activity (sampling first 100 branches)..."
  recent_count=0
  old_count=0
  cutoff_date=$(date -d '30 days ago' +%s 2>/dev/null || date -v-30d +%s 2>/dev/null || echo "0")

  if [ "$cutoff_date" != "0" ]; then
    while IFS= read -r branch; do
      branch_clean=$(echo "$branch" | sed 's/origin\///' | tr -d ' ')
      if [ -n "$branch_clean" ]; then
        last_commit=$(git log -1 --format=%ct "origin/$branch_clean" 2>/dev/null || echo "0")
        if [ "$last_commit" != "0" ] && [ "$last_commit" -gt "$cutoff_date" ]; then
          ((recent_count++))
        else
          ((old_count++))
        fi
      fi
    done < <(git branch -r | grep -v '\->' | head -100)

    echo "  Recent (< 30 days): $recent_count"
    echo "  Old (> 30 days): $old_count"
    echo ""
  fi
fi

# Recommendations
echo "==================================="
echo "Recommendations:"
echo "==================================="
echo "1. Review and delete merged PR branches (issue-numbered)"
echo "2. Review and delete old feature branches"
echo "3. Consider deleting add-* branches if PRs are merged"
echo "4. Keep all protected branches (main, develop, etc.)"
echo ""
echo "Use the GitHub Actions workflow:"
echo "  .github/workflows/cleanup-stale-branches.yml"
echo ""
echo "Or see BRANCH_CLEANUP.md for manual cleanup instructions"
