## Review: PR #17045 vs #17057 (Lightning Image Turbo non-1024 dimensions)

Both diffs apply cleanly to `origin/main` and both fix the same defect: explicit non-1024 dimensions were silently ignored by `callInferencePortImage` (the request body never even sends `width`/`height`).

**Test evidence (ran in `gen.pollinations.ai`):**
- #17045 → 43 passed (`inferencePortImageModel.test.ts` 16, `params.test.ts` 27).
- #17057 → 47 passed (`inferencePortImageModel.test.ts` 14, `params.test.ts` 33).
Both green; no regressions observed.

**Behaviour is equivalent.** For this model the default side length is 1024 (`models.ts:3`, no `IMAGE_DEFAULT_SIDE_LENGTHS` entry), so #17057's schema predicate (`width !== undefined && width !== 1024 || height !== undefined && height !== 1024`) is exactly `dimensionsExplicit && (w !== 1024 || h !== 1024)`. The edit path (`resolveEditDimensionsForImage`, `handler.ts:360`) sets aspect-derived dims with `dimensionsExplicit === false`, so both guards let it through — neither PR changes that (see question below). The model is not a fallback target (`shared/registry/image-fallbacks.ts` has no `lightning-image-turbo`/`inferenceport` entry), so no fallback-eligibility difference.

**Recommendation: #17057.** Model-specific parameter constraints live in `params.ts`'s `superRefine` (duration/fps/resolution/aspectRatio, and gpt-image-2 `transparent`); the schema is the single source of truth and rejects before dispatch. Concretely, `UpstreamError.fromProvider(400, …)` sets `upstreamStatus: 400` (`shared/error.ts:83`), which `track.ts:563` records — so #17045's handler-only rejection marks a caller-input error as an upstream failure, and the dispatch `catch` also routes it through `logGptImageError`. #17057 avoids that for every schema-parsed request. Its schema and handler messages also match, so the wording is stable wherever validation fires.

**Blockers that require the diff to change:** none.

**Non-blocking nit on #17057:** the handler guard is unreachable via `parseImageParams` (the only production caller) and duplicates the schema condition — worth deleting for YAGNI, but harmless and does cover direct callers/tests. #17045's failure message (`supports only`) differs from #17057's (`only supports`); pick one wording in the PR description rather than blocking.

**Questions for the maintainer:**
1. Should aspect-derived edit dimensions (non-explicit, non-square reference image) also be rejected/coerced, or is silent 1024×1024 output acceptable there? Both PRs leave it silent — arguably the same complaint one step deeper.
2. Is a plain 400 the intended contract, or should the API clamp/report the actual output size in a header (`x-model-used` style) so callers know?

VERDICT: APPROVE (merge #17057 as is; close #17045)