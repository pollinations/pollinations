Run tests for enter.pollinations.ai service.

Run all tests (includes decrypt-vars):
```bash
npm run test
```
(Run from enter.pollinations.ai directory)

Run specific tests (preferred - saves time):
```bash
npx vitest run --testNamePattern="$ARGUMENTS"
```

Run specific test file:
```bash
npx vitest run test/specific-file.test.ts
```

**Fresh worktree / running `npx vitest` directly (not `npm run test`):**
1. `npm ci` if `node_modules` is missing (also pins `npx biome` to the lockfile version)
2. `npm run decrypt-vars`
3. `mkdir -p dist/client` — the Workers pool needs the `[assets]` directory from `wrangler.toml` to exist (`NonExistentAssetsDirError` otherwise). No frontend build needed.
4. "0 tests collected" is a startup error, not a pass. Rerun without `--reporter=json`, or `npx vitest list <file>`, to see the cause.

**Frontend changes:** `AuthModal`, `AuthModalLoading`, `ErrorBanner`, `AuthInfoCard` come from `@pollinations/ui/auth`, not the package root — copy the import block from `frontend/src/components/auth/authorize.tsx`. `tsc` ignores missing-module errors for `@pollinations/ui`; only `npm run build:frontend` (which also regenerates the route tree) catches a bad import.

**Before writing tests:**
1. Read existing tests entirely to understand patterns
2. Check `enter.pollinations.ai/package.json` for scripts
3. Prefer adding to existing test files over creating new ones
4. Test core functionality - minimal, short, and sweet

**Testing tokens:** `enter.pollinations.ai/.testingtokens`

**Snapshot system:** Uses VCR-style recording. Set `TEST_VCR_MODE=record` to record new API responses.
