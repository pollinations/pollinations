---
name: code-formatting
description: Format or lint Pollinations JS/TS/JSON changes with Biome when formatting is requested or required before a commit.
---

# Code Formatting

Use the repository's `biome.jsonc` and Node.js/npx. Before write mode, compare the installed Biome version with `node_modules/@biomejs/biome` in the root `package-lock.json`; if they differ, use the exact locked version. Avoid an unpinned download when local dependencies are missing.

For a named file or uncommitted changes, run Biome on those files. For committed branch changes, run from the repository root:

```bash
.claude/skills/code-formatting/scripts/format-branch.sh
```

The script formats `.js`, `.ts`, `.jsx`, `.tsx`, `.json`, and `.jsonc` files in the three-dot diff from `main` to `HEAD`. Pass another base ref as its first argument when needed. It does not discover staged or unstaged changes.

Inspect the resulting diff for unintended churn and report any remaining lint failures. Formatting alone does not require an application test suite.
