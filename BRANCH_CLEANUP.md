# Branch Cleanup Guide

## Overview

This repository has accumulated **2,878 remote branches**, many of which are likely stale, merged, or abandoned. This guide explains how to safely clean up these branches.

## Automated Cleanup Workflow

A GitHub Actions workflow has been created to automate branch cleanup: `.github/workflows/cleanup-stale-branches.yml`

### How to Use

1. **Navigate to Actions tab** in GitHub repository
2. **Select "Clean Up Stale Branches" workflow**
3. **Click "Run workflow"**
4. **Configure options:**
   - **Dry run**: `true` (recommended first) - just lists branches without deleting
   - **Batch size**: `50` (number of branches to process per run)
   - **Branch filter**: Choose from:
     - `merged-prs` - Branches from merged pull requests (safest)
     - `old-issue` - Issue branches older than 6 months
     - `old-feature` - Feature branches older than 6 months
     - `all` - All branches older than 6 months

### Recommended Workflow

1. **First Run (Dry Run)**: 
   ```
   Dry run: true
   Filter: merged-prs
   Batch size: 50
   ```
   Review the artifact to see which branches would be deleted.

2. **Second Run (Live)**:
   ```
   Dry run: false
   Filter: merged-prs
   Batch size: 50
   ```
   This will delete the first 50 merged PR branches.

3. **Repeat** until all merged PR branches are cleaned up.

4. **Review Other Categories**: Then move on to `old-issue` and `old-feature` filters.

## Manual Cleanup

If you prefer manual cleanup, you can use these commands:

### List All Remote Branches
```bash
git fetch --all --prune
git branch -r | grep -v '\->' | wc -l
```

### Delete a Single Branch
```bash
git push origin --delete <branch-name>
```

### Delete Multiple Branches (Bash Script)

Create a file `delete_branches.sh`:

```bash
#!/bin/bash

# List of branches to delete
BRANCHES=(
  "664-potential-for-adding-a-system-role-to-usepollinationstext"
  "668-make-terms-and-conditions-psychedelic"
  # Add more branches here
)

for branch in "${BRANCHES[@]}"; do
  echo "Deleting: $branch"
  git push origin --delete "$branch" || echo "Failed to delete $branch"
  sleep 0.5  # Rate limiting
done
```

Make it executable and run:
```bash
chmod +x delete_branches.sh
./delete_branches.sh
```

## Branch Categories

Based on analysis of branch naming patterns:

### 1. Protected Branches (NEVER DELETE)
- `main`
- `master`  
- `develop`/`development`
- `staging`
- `production`

### 2. Issue-Numbered Branches (e.g., `664-feature-name`)
These are typically from pull requests. Safe to delete if:
- PR is merged
- PR is closed and abandoned
- Branch is older than 6 months

### 3. Feature Branches (e.g., `feature/xyz`, `fix/abc`)
Safe to delete if:
- No open PR
- Older than 6 months
- Work is abandoned

### 4. Active Development Branches
**Keep these:**
- Branches with recent commits (< 1 month)
- Branches with open PRs
- Branches actively being worked on

## Safety Measures

The workflow includes several safety measures:

1. **Protected branch list** - Hard-coded list of branches that can never be deleted
2. **Dry run mode** - Test before actually deleting
3. **Batch processing** - Limit number of branches deleted per run
4. **Artifacts** - Saves list of deleted branches for review
5. **Rate limiting** - Delays between deletions to avoid API limits

## Identifying Merged PRs

To check if a branch's PR was merged:

```bash
# For issue-numbered branch (e.g., 664-feature)
gh pr view 664 --json state,mergedAt

# Get all merged PRs
gh pr list --state merged --limit 1000 --json number,headRefName
```

## Bulk Analysis Script

For a comprehensive analysis before cleanup:

```bash
#!/bin/bash

# Count branches by type
echo "=== Branch Analysis ==="
echo ""

# Total branches
total=$(git branch -r | grep -v '\->' | wc -l)
echo "Total branches: $total"

# Issue-numbered branches
issue_branches=$(git branch -r | grep -v '\->' | grep -E 'origin/[0-9]+-' | wc -l)
echo "Issue-numbered branches: $issue_branches"

# Feature branches
feature_branches=$(git branch -r | grep -v '\->' | grep -E 'origin/(feature|fix|hotfix|bugfix)/' | wc -l)
echo "Feature branches: $feature_branches"

# Copilot branches
copilot_branches=$(git branch -r | grep -v '\->' | grep -E 'origin/copilot/' | wc -l)
echo "Copilot branches: $copilot_branches"

# Add-* branches (project additions)
add_branches=$(git branch -r | grep -v '\->' | grep -E 'origin/add-' | wc -l)
echo "Add-* branches: $add_branches"

echo ""
echo "=== Recommendations ==="
echo "1. Start with merged PR branches (issue-numbered)"
echo "2. Then clean up old feature branches"
echo "3. Finally review other categories"
```

## Monitoring Progress

Track cleanup progress:

```bash
# Before cleanup
git fetch --all --prune
git branch -r | grep -v '\->' | wc -l

# After each cleanup run
git fetch --all --prune
git branch -r | grep -v '\->' | wc -l
```

## Troubleshooting

### Error: "Protected branch can't be deleted"
- The branch has branch protection rules enabled
- Disable protection rules in Settings > Branches first

### Error: "Reference does not exist"  
- Branch was already deleted
- Run `git fetch --all --prune` to sync

### Too Many Branches to Process
- Use smaller batch sizes
- Run multiple times
- Use different filters for different categories

## Best Practices

1. **Always start with dry run mode**
2. **Review the artifact** from dry run before live deletion
3. **Start with merged PR branches** (safest category)
4. **Process in batches** to avoid overwhelming the system
5. **Keep audit trail** - Download artifacts from each run
6. **Coordinate with team** before major cleanups
7. **Run during low-activity periods** to minimize disruption

## Expected Outcomes

After cleanup, you should have:
- **Active branches only**: Recent work and open PRs
- **Protected branches**: Main, develop, etc.
- **Improved performance**: Faster git operations
- **Better hygiene**: Easier to find relevant branches

Target: Reduce from **2,878 branches** to approximately **50-100 active branches**.
