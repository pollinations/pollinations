# Case 17045
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-13 01:21:10 UTC

Kind: pr
Start: 2026-10-13 01:21:10 UTC
Branch: hospital/17045
Base: d3309b1d8849059b8e008919825c899643fd65a8
Source: https://github.com/pollinations/pollinations/pull/17045
fix(image): validate Lightning Image Turbo dimensions
Open PRs that mention this case: https://github.com/pollinations/pollinations/pull/17126 research: hospital trial (agent hospital experiment)
Competing PR: #17057, which fixes the same issue. The maintainer asked the hospital to compare both.

<!-- HOSPITAL:WORKUP -->
2026-10-13 01:26:10 UTC

# Workup note: case 17045 (PR #17045, competing PR #17057)

## Admission
- **Open and non-quest.** PR #17045 is open and fixes issue #17044, also open. It has no POLLEN-QUEST link and no labels.
- **Small.** #17045 adds 8 source lines and 25 test lines. #17057 adds about 21 source lines and 57 test lines. Neither touches `packages/sdk`, `packages/ui` or `packages/polli-cli`, so no version bump is needed.
- **Meaningful.** Lightning Image Turbo always returns 1024×1024 and ignores other sizes. The registry entry (`shared/registry/image.ts:2134`) bills $0.02 per image, so a caller can pay for an image that doesn't match the size they asked for.
- **Offline-verifiable.** Both diffs are tested with Vitest and mocked `fetch`.
- **Other PRs:** #17126 (hospital trial) mentions the case but is not a fix. No precedent is needed because this is not an escalation.

## Call path (base d3309b1d8)
1. `handler.ts:160` runs `ImageParamsSchema.safeParse`. If it fails, it throws a 400: `Invalid parameters: …`.
2. `params.ts:284` sets `dimensionsExplicit` before filling in the default side length. The default for this model is 1024 (`models.ts:3`).
3. `createAndReturnImages.ts:923` calls `callInferencePortImage`. Base `inferencePortImageModel.ts:57` only has a comment saying other sizes are ignored.
4. The OpenAI `/v1/images` route (`routes/images.ts:93`) only sends width and height when `size` is given, so both PRs handle it correctly.

## Comparison

| | #17045 | #17057 |
|---|---|---|
| Where it rejects | Adapter only, just before upstream | Schema (`params.ts` superRefine, next to the existing gpt-image-2 rule) **and** adapter |
| Tests | Adapter: 768×1024, 1024×768, 1536×1536 | Adapter: 768×1024. Schema: default and explicit 1024 accepted; 3 pairs plus `width=512` alone and `height=512` alone rejected |
| Biome (repo config, files patched in `/tmp`) | **Fails formatting** in `inferencePortImageModel.test.ts` (the `it.each` callback layout) | Clean on all 4 files |
| CI impact | `ci-pull-request-checks.yml:122` fails when `biome check --write` changes anything, so this blocks the merge | None |

**Recommendation: #17057.**
- It is CI-clean.
- It rejects at the schema, so the caller gets the standard `Invalid parameters` 400 before the request is dispatched or reaches the provider.
- It is the only one of the two that tests acceptance of the default and of explicit 1024×1024, which the issue requires.

**Weakness (advisory, not a blocker):** the adapter check in #17057 repeats the schema check, which goes against the repo's single-source-of-truth rule. Review should check whether any caller reaches `callInferencePortImage` without going through `ImageParamsSchema`. If none does, the adapter copy could be dropped in a follow-up. That would be a suggestion to the author; the hospital should not rewrite the PR.

## Baseline tests (base code, run-test logs)
- `TEST_VCR_MODE=replay-only npx vitest run test/image/inferencePortImageModel.test.ts`: exit 0.
- `TEST_VCR_MODE=replay-only npx vitest run test/image/params.test.ts`: 27/27 passed, exit 0.

## Treatment plan
1. **Apply the diff.** From the repo root on `hospital/17045`, run `git apply /home/user/pollinations-hospital/cache/pr-17057.diff`. I checked it applies cleanly to the base copies with `patch`. Files changed:
   - `gen.pollinations.ai/src/image/params.ts`
   - `gen.pollinations.ai/src/image/models/inferencePortImageModel.ts`
   - `gen.pollinations.ai/test/image/params.test.ts`
   - `gen.pollinations.ai/test/image/inferencePortImageModel.test.ts`
2. **Format check.** Run `node_modules/.bin/biome check` on the 4 files. It must produce no changes.
3. **Green run.** From `gen.pollinations.ai/`, run each file in its own run-test command:
   - `TEST_VCR_MODE=replay-only npx vitest run test/image/params.test.ts`
   - `TEST_VCR_MODE=replay-only npx vitest run test/image/inferencePortImageModel.test.ts`
4. **Reversal proof.**
   - Save the two patched source files, restore their base versions with `git show d3309b1d8:<path>`, and keep the new tests.
   - Rerun both files. Expected results:
     - The `params.test.ts` rejection cases fail because `success` is true.
     - The adapter test fails because it doesn't get the dimension 400.
   - With the adapter check removed, the unmocked `fetch` would reach the safety or upstream path. Run that file inside `unshare -rn` with loopback up (checked: outbound traffic is blocked) so nothing reaches the internet.
   - Restore the patched sources even if a command fails, then rerun to show green.
5. **Optional duplication check.** Remove only the adapter check. The schema tests should stay green, which shows the duplication without changing the PR.
6. **Existing expectations:** none change. No release metadata, `APIDOCS.md` or legal-doc impact, because routing and processing are unchanged.

## Risks
- **Duplicate validation (#17057):** discussed above; advisory only.
- **Hardcoded model ID:** the model ID string sits in `params.ts`. This follows the existing gpt-image-2 transparent-background rule.
- **Non-integer sizes:** values like `width=abc` fall back to the default and are accepted. This matches the issue's "omitted dimensions" behaviour.
- **#17045's merge blocker** is a formatting failure in its own diff. Because #17057 is recommended, that blocker is reported here rather than driving the verdict.

Estimate: about 78 added lines, 0 deleted.

VERDICT: APPROVE

<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-13 01:27:55 UTC

Plan approved; recommend cached PR **#17057**.

- Both diffs address #17044 by rejecting explicit non-1024 dimensions before the billable InferencePort request. #17057 additionally rejects them in `ImageParamsSchema`, which `handler.ts:160` converts into the standard HTTP 400 before edit-image probing or generation.
- #17057 covers omitted dimensions, explicit 1024×1024, portrait, landscape, oversized, and single-sided invalid dimensions. #17045 only adds adapter rejection tests. The workup also reports a formatting failure in #17045; #17057’s formatting remains an implementation check.
- `routes/images.ts:93` preserves omitted dimensions. The schema validates supplied dimensions before its transform fills defaults and records `dimensionsExplicit`. The proposed guard therefore matches the issue’s requested behavior.
- The only production caller of `callInferencePortImage` is the dispatch in `createAndReturnImages.ts:925`. Duplicate adapter validation is advisory, not a correctness blocker. Apply #17057 unchanged; omit the optional duplication experiment.

**Verification evidence:** On the unchanged base commit, both files passed inside `unshare -rn` with loopback enabled:

- `plan-review-1.log`: adapter tests, 13/13, exit 0.
- `plan-review-2.log`: parameter tests, 27/27, exit 0.

These runs confirm that the planned network isolation supports the Workers test runner. It matters because the added adapter test’s fetch spy calls through when its production guard is reversed. `git apply --check` also passed for `pr-17057.diff`; the branch remains clean at the specified base.

**Execution requirements:** Apply only the four-file cached #17057 diff and check formatting without rewriting it. At review, save patched source contents, restore both production files to base while retaining added tests, and run each file separately through `run-test` under network isolation. Require dimension-specific failures, restore sources in `finally`, then require both files green with existing expectations intact. Approval here covers the plan; it does not establish the still-pending regression red/green proof.

No code or hospital records were manually changed.

VERDICT: APPROVE

<!-- HOSPITAL:IMPLEMENT -->
2026-10-13 01:29:06 UTC

The four-file #17057 diff is applied unchanged on `hospital/17045`, and both affected test files pass in network-isolated runs.

## Diff scope
- **How it was applied:** `git apply --check` passed on base `d3309b1d8`, then `git apply /home/user/pollinations-hospital/cache/pr-17057.diff`. Nothing beyond the cached diff was edited. The branch stays at the base commit with uncommitted changes, as instructed.
- **Size:** 4 files, 78 added lines, 0 deleted, matching the workup estimate.
  - `gen.pollinations.ai/src/image/params.ts` (+12): a `superRefine` check, next to the gpt-image-2 transparency rule. When the model is `inferenceport-ai/lightning-image-turbo`, it rejects any `width` or `height` that is given and is not 1024.
  - `gen.pollinations.ai/src/image/models/inferencePortImageModel.ts` (+9): when `dimensionsExplicit` is set and the size is not 1024×1024, it throws `UpstreamError.fromProvider(400, …)` before the API key lookup and before `fetch`.
  - `gen.pollinations.ai/test/image/params.test.ts` (+36):
    - Accepts the default size: 1024×1024 with `dimensionsExplicit: false`.
    - Accepts an explicit 1024×1024 with `dimensionsExplicit: true`.
    - Rejects five cases via `it.each`: 768×1024, 1024×768, 1536×1536, `width=512` alone, `height=512` alone.
  - `gen.pollinations.ai/test/image/inferencePortImageModel.test.ts` (+21): explicit 768×1024 is rejected with status 400, a message containing `1024x1024`, and the `fetch` spy never called.
- **Existing expectations:** none were changed, skipped or weakened. No tests were deleted.

## Format check
`node_modules/.bin/biome check` on the 4 files gave "Checked 4 files in 15ms. No fixes applied." with exit 0. This is the repo's own Biome, run without `--write`.

## Green run
Each file ran separately through `hospital.py run-test` from `gen.pollinations.ai/` with `TEST_VCR_MODE=replay-only`. Both ran inside `unshare -rn` with loopback up, the same wrapper used in `plan-review-1.log`.

| Log | File | Base (earlier logs) | With #17057 |
|---|---|---|---|
| `implement-1.log` | `test/image/params.test.ts` | 27/27 | **33/33 passed, exit 0** |
| `implement-2.log` | `test/image/inferencePortImageModel.test.ts` | 13/13 | **14/14 passed, exit 0** |

The pass counts went up by exactly the added cases: +6 in `params.test.ts` (1 accept test and 5 `it.each` rejections) and +1 in the adapter file. All tests that existed before are still green.

## Remaining gaps (for review stage)
- **Reversal proof not yet done.** The approved plan gives this step to review: save the patched sources, restore both production files from `d3309b1d8` while keeping the added tests, and run each file under `unshare -rn`. Expected failures:
  - the five rejection cases in `params.test.ts`, because `success` would be true;
  - the adapter test, because no 400 is thrown and the `fetch` spy is called.

  Then restore the sources in `finally` and show both files green again. I did not run it here so this stage stays implementation only.
- **Duplicate check (advisory).** The adapter check repeats the schema rule. Plan review found that `createAndReturnImages.ts:925` is the only production caller, so this is not a correctness blocker. It is a possible follow-up suggestion to the author, not a hospital edit.
- **Not checked:** an end-to-end HTTP 400 through `handler.ts:160` (it would need the worker runtime and auth) and live InferencePort behaviour (out of scope under P1). I took the schema-to-400 mapping from the workup's reading of `handler.ts:160`; it was not re-run in this stage.
- **#17045 (not recommended)** still has the formatting failure reported in the workup. That is the author's to fix if the maintainer prefers it.

No hospital records were modified, nothing was committed, and nothing was written to GitHub.

VERDICT: APPROVE

<!-- HOSPITAL:REVIEW -->
2026-10-13 01:30:40 UTC

Review complete: approve the applied **PR #17057**, the recommended competitor for case #17045. No merge-blocking findings.

- **Plan fidelity:** All four files match the cached `pr-17057.diff` exactly: 78 added lines, no unrelated changes or weakened expectations. The working tree is clean after restoring the production files; I made no commits.
- **Correct entry point:** `gen.pollinations.ai/src/image/params.ts:161` rejects supplied non-1024 dimensions before defaults are filled. `handler.ts:160` converts schema failures into HTTP 400. The OpenAI-compatible route preserves omitted dimensions, allowing the existing 1024×1024 default.
- **Upstream protection:** `inferencePortImageModel.ts:64` rejects explicit unsupported dimensions before credential lookup, safety checks, or provider fetch. Provider usage validation and billing remain unchanged.

Independent reversal proof used saved source contents and `try/finally` restoration. Every test ran separately through `hospital.py run-test`, with replay-only mode and outbound networking disabled:

| Evidence | Result |
|---|---|
| `review-1.log` — schema, production changes removed | Exactly five added rejection cases failed: invalid dimensions were accepted. Existing tests passed. |
| `review-2.log` — adapter, production changes removed | Added regression failed because the missing guard reached a network call blocked by isolation instead of returning the dimension-specific 400. All 13 existing tests passed. |
| `review-3.log` — schema, patch restored | 33/33 passed, exit 0. |
| `review-4.log` — adapter, patch restored | 14/14 passed, exit 0. |
| `review-5.log` — repository Biome | Four files clean; no fixes applied, exit 0. |

The comparison still favors #17057: it validates at the public schema boundary and covers default acceptance, explicit 1024×1024 acceptance, and single-sided invalid dimensions. #17045 validates only in the adapter and has the formatting blocker documented in workup. This approval applies to **#17057**, not the original #17045 diff.

The repeated adapter guard is a nonblocking simplification opportunity already considered by plan review. No live provider or authenticated HTTP verification was performed; the scoped offline tests and inspected call path establish the requested rejection behavior.

VERDICT: APPROVE

<!-- HOSPITAL:DISCHARGE -->
2026-10-13 01:32:16 UTC

# Discharge note: case 17045 (PR #17045, competing PR #17057 applied)

Every applicable item passes, so the case can be discharged. What is being discharged is the recommended competitor **#17057**, not #17045's own diff.

## Checklist

| # | Item | Evidence | Result |
|---|---|---|---|
| 1 | Admission gates | Open, non-quest, no labels. Doesn't touch `packages/sdk`, `packages/ui` or `packages/polli-cli`, so no version bump is needed. #17045 and #17057 are both under 100 lines. | PASS |
| 2 | Competing PR compared and one recommended | The workup table recommends #17057: it rejects at the schema boundary and covers more cases, while #17045's own test file fails the Biome format check. Plan review agreed. | PASS |
| 3 | Plan approved before implementation | Workup note 01:26:10. Plan review approved at 01:27:55. First implementation log `implement-1.log` at 01:28:35, and source changes followed approval. | PASS |
| 4 | Independent reviewer | Workup and implementation ran on `anthropic/claude-opus-5.5` (from the stage logs). Plan review and review ran on `openai/gpt-6.1-sol` under Codex (`plan-review-1.log` and `review-1.log` headers). | PASS |
| 5 | Implementation is exactly the cached PR diff | `git diff d3309b1d8 HEAD`: 4 files, +78/−0. Its ± lines are identical to `cache/pr-17057.diff` (scripted line comparison, 78 = 78, equal). HEAD `c4ec5ee2d` is the driver's "hospital: implement case 17045" commit, and the working tree is clean. | PASS |
| 6 | Baseline green before the change | `workup-1.log` adapter 13/13, exit 0. `workup-2.log` params 27/27, exit 0. `plan-review-1/2.log` gave the same counts under `unshare -rn`. | PASS |
| 7 | Red: production changes reverted, new tests kept | `review-1.log`: exactly the 5 new `it.each` rejection cases fail (`expected true to be false`, so the schema accepted bad sizes), 28 pass, exit 1. `review-2.log`: only the new adapter test fails, because without the guard the call reached the blocked network (`internal error`) instead of returning a 400. 13 existing tests pass, exit 1. Both failures are for the intended reason. | PASS |
| 8 | Green: changes restored | `review-3.log` params 33/33, exit 0. `review-4.log` adapter 14/14, exit 0. These match `implement-1/2.log`. | PASS |
| 9 | Network isolation / offline only | Every Vitest command used `TEST_VCR_MODE=replay-only` inside `unshare -rn` with only loopback up, one file per command, all through `run-test`. | PASS |
| 10 | No weakened or edited expectations | 0 deleted lines. Pass counts rose only by the added cases: params +6, adapter +1. All earlier tests stay green. | PASS |
| 11 | Format | `review-5.log`: the repo's own Biome checked 4 files, "No fixes applied", exit 0. | PASS |
| 12 | Unresolved blockers | None. The duplicated adapter guard is advisory (plan review found the only production caller is `createAndReturnImages.ts:925`). The end-to-end 400 through `handler.ts:160` was established by reading the code, not by running it. | PASS (advisory) |
| 13 | Size and budget | 78 lines, far below ~1,000. Reworks: 0. Ledger spend from case start at 01:21:10 is about $3.45 (claude + codex keys). That is within `run.json` `case_limit` 8. The whole-run total from 00:09 is about $5.72, within `trial_limit` 10. | PASS (see note) |
| 14 | Hospital rules (no GitHub writes, secrets or live APIs) | Not found in any stage log. Nothing was published. | PASS |

## Notes for the maintainer
- **Budget limits conflict.** Precedent P2 says to stop above 3 Pollen per case, but PROTOCOL makes `run.json`'s `case_limit: 8` the driver limit. This case is at about 3.45 by the ledger, which may lag. If P2's per-case cap still applies, Thomas should confirm.
- **This is local evidence, not CI.** The targeted tests are not GitHub CI, and #17057's CI status was not checked.
- **What to tell the authors:**
  - #17045 should be closed in favour of #17057, or have its formatting fixed.
  - #17057 could optionally drop the duplicated adapter check later.
- **Not checked:** live InferencePort behaviour (excluded by P1).

VERDICT: APPROVE

<!-- HOSPITAL:CLOSED -->
2026-10-13 01:32:16 UTC

Local dry-run discharge only. Audit passed; nothing published.
