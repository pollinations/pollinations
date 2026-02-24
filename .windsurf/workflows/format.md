---
description: Format changed files on the current branch using Biome
---

# Format Changed Files

Run Biome check with auto-fix on all JS/TS/JSON files changed on this branch compared to main.

// turbo
1. Run the format script:
```bash
bash tools/scripts/format-branch.sh
```

2. If there are formatting changes, stage and commit them:
```bash
git add -u && git commit -m "Format with Biome"
```
