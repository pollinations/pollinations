## Blocker

- **Preserve caching of completed refusal responses** — `gen.pollinations.ai/src/utils/text-cache.ts:54` omits `refusal` from `CHAT_OUTPUT_FIELDS`. A valid stream containing only `delta.refusal` is therefore classified as empty and never cached. Identical requests repeatedly reach the provider instead of replaying the completed answer.
  - This is a supported output, not hypothetical: `gen.pollinations.ai/src/text/responses/chatResponse.ts:517` converts provider refusal events into `delta.refusal`; the chunk emitter is at `:340`.
  - **Reproduced:** extending the existing positive-cache test with a refusal-only stream, terminal usage, and `[DONE]` fails: **expected `HIT`, received `MISS`**.
  - **Required change:** include nonempty `refusal` as output and add regression coverage.

## Question for the maintainer

- **How will existing cached empty streams be cleared?** This patch only prevents new writes. `gen.pollinations.ai/src/utils/text-cache.ts:227` still serves existing entries without checking emptiness, and cache reads refresh their TTL. If #14994 concerns an already-poisoned entry, this change alone will not recover it. Is targeted invalidation planned?

## Verification

- Applied the cached diff to the scratch branch.
- Hospital-wrapped `npm run test -- test/text-cache.test.ts`: **16/16 passed**.
- Hospital-wrapped refusal regression: **1 failed, 15 skipped**, with the cache mismatch above.
- Removed the review-only test modification; retained only the supplied PR diff.
- `git diff --check` passed. No live API calls, installs, commits, or external writes.

VERDICT: CHANGES