---
name: code-formatting
description: Format code on the current branch using Biome. Use when asked to format, lint, or clean up code before committing or creating a PR.
---

# Code Formatting

Format JS/TS/JSON files changed on the current branch using Biome.

## Quick Usage

```bash
.claude/skills/code-formatting/scripts/format-branch.sh
```

This formats all `.js`, `.ts`, `.jsx`, `.tsx`, `.json`, `.jsonc` files changed compared to `main`.

## Custom Base Branch

```bash
.claude/skills/code-formatting/scripts/format-branch.sh develop
```

## What It Does

1. Finds files changed on current branch vs base branch
2. Filters to JS/TS/JSON files only
3. Runs `npx biome check --write` on those files
4. Uses same settings as the `biome-check.yml` CI workflow

## Config

Biome config is at `biome.jsonc` in repo root.

## Notes

- Run from repo root
- Requires Node.js/npx
- Only formats changed files (not entire codebase)
