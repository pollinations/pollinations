# GitHub Star Count Guidelines

## Overview

This document explains how to add and maintain GitHub star counts for projects in the README.md file. Star counts provide users with valuable context about project popularity.

## Using the GitHub Star Fetcher Script

We've created a simple script to fetch GitHub star counts:

```bash
# From the repository root directory
node .github/scripts/github-star-fetcher.js owner/repo

# Example
node .github/scripts/github-star-fetcher.js pollinations/pollinations
```

This will output:
```
Fetching star count for pollinations/pollinations...

Results:
-------------------------------------
Repository:    pollinations/pollinations
Stars:         1645
Formatted:     ⭐ 1.6k
Markdown:      [pollinations/pollinations](https://github.com/pollinations/pollinations) - ⭐ 1.6k
-------------------------------------
```

## Adding Star Counts to Projects

When adding or updating projects in README.md:

1. For any project with a GitHub repository:
   - Run the script to get the current star count
   - Copy the formatted Markdown output
   - Paste it in the README.md links column

2. Example format in README.md table:
   ```markdown
   | Project Name | Description | Creator | [Website](https://example.com), [GitHub](https://github.com/owner/repo) - ⭐ 1.2k |
   ```

3. Only add star counts to the README.md, not to:
   - projectList.js
   - projects.csv

## Best Practices

- Update star counts for popular projects (1k+ stars) during major README updates
- For new projects, add the initial star count when adding the project
- Star counts don't need to be exact - they're meant to give a general sense of popularity
- Round numbers display better (e.g., "1.6k" instead of "1,634")
- The script handles formatting automatically - use its output directly
