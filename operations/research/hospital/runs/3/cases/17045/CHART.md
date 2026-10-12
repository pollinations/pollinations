# Case 17045
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-12 20:56:27 UTC

Kind: pr
Start: 2026-10-12 20:56:27 UTC
Branch: hospital/17045
Base: 90e652b5d0b7d30af6a71f2631cb4f12fc68579e
Source: https://github.com/pollinations/pollinations/pull/17045
fix(image): validate Lightning Image Turbo dimensions
Open PRs that mention this case: none in cache

<!-- HOSPITAL:WORKUP -->
2026-10-12 21:00:08 UTC

## Workup note: case 17045 (PR #17045, "fix(image): validate Lightning Image Turbo dimensions")

**Admission check**
- The PR is open and not a quest; it fixes issue #17044, which is still open. It touches only `gen.pollinations.ai`, not sdk, ui or polli-cli, so no version bump is needed.
- It is small: about +8/−1 lines in the source file and +25 in the test.
- It can be verified offline: the adapter test mocks `fetch`, so nothing reaches a live service.
- No other open PRs mention this case. PR #17043 is a separate fix for multiple reference images.
- `git apply --check` of `cache/pr-17045.diff` against base `90e652b5d` succeeds.

**Call path**
1. `src/image/params.ts:284` sets `dimensionsExplicit = width !== undefined || height !== undefined`. This happens before `adjustImageSizeForModel` fills in defaults. For this model the default is 1024 (`src/image/models.ts:3`, no override).
2. `src/image/createAndReturnImages.ts:923` sends `inferenceport-ai/lightning-image-turbo` to `callInferencePortImage`.
3. In `src/image/models/inferencePortImageModel.ts:57`, the base code only has a comment ("other sizes are ignored"). Dimensions are never sent upstream, so the issue's bug is confirmed.
4. The PR adds a guard at the very top of `callInferencePortImage`. It throws `UpstreamError.fromProvider(400, …)` when `dimensionsExplicit` is true and the size is not 1024×1024. This happens before the API-key lookup, `requireSafePrompt`, the reference-image downloads and `fetch`. It uses the same pattern as the existing `transparent` rejection just below it.

**Edge cases checked**
- **Dimensions omitted:** `dimensionsExplicit` is false, the size defaults to 1024×1024, and the request is accepted.
- **Edit requests with a reference image and no size:** `resolveEditDimensionsForImage` (`src/image/handler.ts:363`) rewrites width/height from the source image but leaves `dimensionsExplicit` false. These requests are still accepted, which is correct because the adapter ignores dimensions anyway.
- **Only one side given, e.g. `width=1024`:** the missing side defaults to 1024, so the request passes. `width=768` alone is rejected, which matches the issue.
- **OpenAI-compatible `size`:** `src/routes/images.ts:94` only sets width/height when `size` is passed, so the explicit flag is right there too.
- **Comment removed:** the PR deletes the "other sizes are ignored" comment. The new error message carries the same information, so nothing is lost.

**Treatment plan for the review stage**
1. Apply the cached diff to the hospital branch: `git apply /home/user/pollinations-hospital/cache/pr-17045.diff`.
2. Regression proof:
   - Temporarily revert only the change to `src/image/models/inferencePortImageModel.ts`, keeping the original file contents.
   - Run `TEST_VCR_MODE=replay-only npx vitest run test/image/inferencePortImageModel.test.ts` from `gen.pollinations.ai/`.
   - Expected: the three new `it.each` cases (768×1024, 1024×768, 1536×1536) fail because the call resolves, or `fetchSpy` is called, instead of rejecting with a 400.
3. Restore the source change and run the same command. Expected: the 13 existing tests plus the 3 new ones (16) all pass.
4. Run `npx biome check` on both changed files with the real file paths. A stdin check failed on the unchanged base file too, so it tells us nothing; the review needs a check on the files themselves.
5. Release metadata: none needed (gen Worker only). No registry change, OpenAPI change or `APIDOCS.md` edit. No change to data processing, so no legal documents are affected.

**Baseline evidence**
- The run-test log shows `test/image/inferencePortImageModel.test.ts` on the base commit with 13 of 13 passing, exit 0.

**Risks**
- **Behaviour change:** callers who currently send other sizes and quietly get 1024×1024 will now get a 400. The issue explicitly asks for this, and it stops callers being billed for output they didn't ask for.
- **Status code:** `UpstreamError.fromProvider(400)` gives a 400 just like the existing transparent check, so status mapping is unaffected.
- No billing, auth or fallback paths are touched, and no existing test expectations are changed.

**Merge blockers in the diff:** none found. The change is minimal and reuses the existing rejection pattern.

VERDICT: APPROVE

<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-12 21:02:05 UTC

Plan approval is blocked by the proposed red run’s network access.

- **Evidence:** The cached PR adds `vi.spyOn(globalThis, "fetch")` without a mock implementation in `test/image/inferencePortImageModel.test.ts`. A spy calls the original function. Removing the production guard therefore allows the new cases to reach the provider request in `src/image/models/inferencePortImageModel.ts:96`.
- **Replay mode does not prevent this:** This test file does not install the VCR fetch interceptor. The global setup in `test/setup/public-tinybird-pipes.ts:28` forwards requests outside its three Tinybird endpoints to `networkFetch`. Setting `TEST_VCR_MODE=replay-only` alone does not make these requests offline.
- **Existing evidence:** `tests/workup-1.log` records the unmodified adapter’s 13 tests passing, exit 0. It contains neither the added regressions nor a red run, so it does not establish that the proposed verification is safe.
- **Source assessment:** The guard matches cached issue #17044. `params.ts:284` captures explicit dimensions before defaults; the OpenAI route preserves omitted dimensions; inferred edit dimensions retain `dimensionsExplicit: false`. No production correctness blocker was identified in this inspection.

**I-PASS handoff**

- **Severity:** Blocking verification-plan defect.
- **Patient summary:** Small dimension-validation PR; planned regression reversal can contact the live provider with the test credential.
- **Action list:** Revise the hospital verification plan to provide a deterministic successful provider response through an explicitly scoped offline fetch stub during both red and green runs. Preserve all assertions and restore temporary changes with `try/finally`. Route each single-file test command through `hospital.py run-test`.
- **Situation/risk:** Without that interception, the red run violates the offline boundary and may fail because of networking or provider authentication rather than the missing validation.
- **Synthesis:** The next attending must confirm offline interception and the expected regression signal before implementation proceeds. This requests rework of the hospital verification plan, not a different production fix.

No files changed or tests executed during this plan-review stage. Red/green approval remains pending.

VERDICT: REWORK

<!-- HOSPITAL:WORKUP -->
2026-10-12 21:04:21 UTC

The account behind this API key doesn't have enough credits. This model needs paid Pollen. Please [top up](https://enter.pollinations.ai/top-up?ref=agent_low_balance_topup), then try again.

If this isn’t your Pollinations account, contact whoever runs the app or service you’re using.

<!-- HOSPITAL:HANDOFF -->
2026-10-12 21:04:21 UTC

Precedents checked P1. I-PASS: missing structured verdict; inspect record; no automatic retry.
