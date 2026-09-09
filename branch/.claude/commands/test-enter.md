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

**Before writing tests:**
1. Read existing tests entirely to understand patterns
2. Check `enter.pollinations.ai/package.json` for scripts
3. Prefer adding to existing test files over creating new ones
4. Test core functionality - minimal, short, and sweet

**Testing tokens:** `enter.pollinations.ai/.testingtokens`

**Snapshot system:** Uses VCR-style recording. Set `TEST_VCR_MODE=record` to record new API responses.
