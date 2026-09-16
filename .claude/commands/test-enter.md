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

**Fresh worktree / targeted run (running `npx vitest` directly, not `npm run test`):**
1. `npm ci` if `node_modules` is missing (also needed so `npx biome` resolves the pinned version, not a stray global one)
2. `npm run decrypt-vars`
3. `mkdir -p dist/client` — the Workers pool reads `wrangler.toml`'s `[assets] directory = "dist/client"` and aborts with `NonExistentAssetsDirError` if it's missing; a full frontend build is not required for backend tests
4. If a run reports 0 tests collected, treat it as a startup error, not a pass — rerun without `--reporter=json` (the config's default reporter shows the real cause), or run `npx vitest list <file>` to diagnose

**Frontend changes:** `AuthModal`/`AuthModalLoading`/`ErrorBanner`/`AuthInfoCard` are exported from the `@pollinations/ui/auth` subpath, not the package root — copy the import block from `frontend/src/components/auth/authorize.tsx` rather than guessing. `tsc` filters out "cannot find module" errors for `@pollinations/ui` and can pass on a bad import; only `npm run build:frontend` (which also regenerates the TanStack route tree) reliably catches it.

**Before writing tests:**
1. Read existing tests entirely to understand patterns
2. Check `enter.pollinations.ai/package.json` for scripts
3. Prefer adding to existing test files over creating new ones
4. Test core functionality - minimal, short, and sweet

**Testing tokens:** `enter.pollinations.ai/.testingtokens`

**Snapshot system:** Uses VCR-style recording. Set `TEST_VCR_MODE=record` to record new API responses.
