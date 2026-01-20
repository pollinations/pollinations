Run tests for enter.pollinations.ai service.

First decrypt the environment variables, then run vitest:

```bash
cd enter.pollinations.ai && npm run test
```

For running specific tests (preferred - saves time):
```bash
cd enter.pollinations.ai && npm run decrypt-vars && npx vitest run --testNamePattern="$ARGUMENTS"
```

Or run a specific test file:
```bash
cd enter.pollinations.ai && npm run decrypt-vars && npx vitest run test/specific-file.test.ts
```

**Before writing tests:**
1. Read existing tests entirely to understand patterns
2. Check `enter.pollinations.ai/package.json` for scripts
3. Prefer adding to existing test files over creating new ones
4. Test core functionality - minimal, short, and sweet

**Testing tokens:** `enter.pollinations.ai/.testingtokens`

**Snapshot system:** Uses VCR-style recording. Set `TEST_VCR_MODE=record` to record new API responses.
