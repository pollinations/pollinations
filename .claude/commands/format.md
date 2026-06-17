Run biome check on changed files to fix formatting issues.

```bash
# Get list of changed files and run biome on them
git diff --name-only HEAD | grep -E '\.(js|ts|jsx|tsx)$' | xargs -r npx biome check --write 2>/dev/null || true
```

If there are staged changes, also check those:
```bash
git diff --cached --name-only | grep -E '\.(js|ts|jsx|tsx)$' | xargs -r npx biome check --write 2>/dev/null || true
```
