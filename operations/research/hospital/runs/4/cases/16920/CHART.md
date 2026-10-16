# Case 16920
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-12 22:31:36 UTC

Kind: pr
Start: 2026-10-12 22:31:36 UTC
Branch: hospital/16920
Base: 43c9d81f59ebe92f45f2e066fab24609fd06f42f
Source: https://github.com/pollinations/pollinations/pull/16920
fix(image): fail GPT Image over to the sibling Azure region on 401/402/403
Open PRs that mention this case: none in cache

<!-- HOSPITAL:WORKUP -->
2026-10-12 22:34:50 UTC

**Workup note: Case 16920 (PR, fix(image): GPT Image region failover on 401/402/403)**

**Admission**
- The PR is open, not a quest and has no labels. It touches only `gen.pollinations.ai` (3 files, about +60/−10 lines), so the sdk/ui/polli-cli version-bump rule doesn't apply.
- No other open PR in the cache mentions it. Issue #13174 isn't in the cache, so the PR body is the only description of it.
- The change is meaningful: since #15779, a per-resource Azure abuse block (403, the #12446 outage) fails the request even though the sibling region is healthy.
- It can be verified offline: both test files use mocked fetch or VCR mocks, with no live Azure.

**Call path, checked at base `43c9d81f5`**
- `isGPTImageRefusedByAzure` (`src/image/createAndReturnImages.ts:460-466`) returns true only for `UpstreamError` that is not `UserImageError` with status 429 or 404.
- It has two callers, so changing this one predicate changes both failover levels:
  - the region loop in `callGPTImage` (`createAndReturnImages.ts:754-758`);
  - the OpenAI-direct fallback in `shouldFallback` (`src/image/handler.ts:293`).
- `ensureUpstreamOk` (`shared/error.ts:107-128`) fills in `responseBody`, so the PR's `providerErrorText(error.responseBody)` has the data it needs.
- `isContentPolicyViolation` already rules out `ACCOUNT_BLOCK_PATTERNS` ("your resource has been temporarily blocked"; `contentModeration.ts:58-74`). So the Azure resource block still counts as a refusal, and a real moderation refusal stays terminal. That matches the PR's claim.
- 5xx, 408 and 524 stay terminal, which keeps the "may already be billed" rule from #13173. No new provider, region or intermediary is added; it reuses the regions and OpenAI-direct target that are already declared. So no sub-processor or legal docs need changing.
- `git apply --check` succeeds. The `generation-vcr.test.ts` hunk applies at offset +307 (line 3249).
- The VCR mock (`generation-vcr.test.ts:381-391`) returns `{error:{code:"RateLimitReached"}}` with `azureStatus` from both Sweden and East US 2. A 403 with that body is not content-policy wording, so the new 403 case tests the intended path.

**Baseline evidence**
- `TEST_VCR_MODE=replay-only npx vitest run test/image/gptImageRouting.test.ts` passed 19/19, exit 0 (run-test log).

**Merit review of the diff**
- It changes one predicate, adds one status set and reuses the existing moderation helpers. That fits Ponytail: it is the smallest correct change.
- The content-policy exclusion is a narrow guard, but it has a concrete reason: a moderation refusal would be repeated in every region and in OpenAI direct.
- Minor caveat for maintainers: 401/402 failover can hide a bad or unpaid key in one region behind the healthy sibling. `logError` still records each regional failure, so I don't consider it a blocker.
- No merge blocker found in the diff.

**Treatment plan**
1. Apply the diff: `git apply /home/user/pollinations-hospital/cache/pr-16920.diff` from the repo root. Files:
   - `gen.pollinations.ai/src/image/createAndReturnImages.ts`
   - `gen.pollinations.ai/test/image/gptImageRouting.test.ts`
   - `gen.pollinations.ai/test/generation-vcr.test.ts`
2. Reversal proof: save a copy of the patched `createAndReturnImages.ts`, then restore the base version with `git checkout 43c9d81f5 -- <that file>`, keeping the new tests. Run from `gen.pollinations.ai`:
   - `TEST_VCR_MODE=replay-only npx vitest run test/image/gptImageRouting.test.ts`
   - Expected failures:
     - the 401/402/403 "tries the other region" and "fails after every region refused" cases;
     - "tries the other region when Azure blocks one resource" (only one host is called).
   - The 403 content-policy case is expected to pass at base too: it guards the new exclusion rather than catching a regression. The review should say so and not count it as a failing regression test.
   - `TEST_VCR_MODE=replay-only npx vitest run test/generation-vcr.test.ts -t "falls back to OpenAI direct"`: the 403 case should fail at base (the request ends without falling back to OpenAI direct), and the 429/404 cases should pass.
3. Restore the patched source, even if a command fails, then rerun both commands and expect all green. The existing gpt-image routing and VCR expectations must stay green.
4. Run `npx biome check` on the 3 files. No release metadata is needed.

**Changes to existing expectations, which plan review must approve as intended contract changes**
- `UPSTREAM_FAILURES` goes from `[400, 524]` to `[400, 408, 500, 524]`. This adds terminal cases and weakens nothing.
- `AZURE_REFUSALS` goes from `[429, 404]` to `[401, 402, 403, 404, 429]`.
- The VCR `test.for` list gains 403.

These are the PR's stated contract change. No existing assertion is removed or loosened.

**Risks**
- `generation-vcr.test.ts` is large. Run it only with the `-t` filter, in replay-only mode.
- If any VCR case tries to reach the network, stop and escalate rather than recording.

**Estimate:** about 70 changed lines from the cached diff, with no hospital-authored code.

VERDICT: APPROVE

<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-12 22:36:28 UTC

Plan review: approve the bounded plan to apply the cached PR diff.

- Confirmed clean branch `hospital/16920`. No files changed during this stage.
- The shared predicate has two callers: regional retry in `createAndReturnImages.ts:756` and provider fallback in `handler.ts:293`. The proposed routing tests and filtered worker tests exercise both.
- `ensureUpstreamOk` preserves the upstream status, message, and response body. The reused moderation helper excludes Azure’s explicit resource-block wording while recognizing `content_policy_violation`, supporting the intended distinction.
- The diff preserves the `UserImageError` exclusion and leaves 408/5xx/524 terminal. It changes no provider targets, credentials, prices, or usage calculation.
- Approve the named test-table expansions as intended contract changes. Existing assertions remain intact; adding terminal-status cases strengthens coverage.
- Baseline evidence: `tests/workup-1.log` records 19/19 routing tests passing, exit 0. Contributor-reported runs are not hospital verification evidence.

The planned reversal should expose seven new routing failures: two cases each for 401/402/403, plus the resource-block case. The filtered worker test should additionally fail for 403. The new moderation case should pass against the base and must not be presented as red regression evidence.

Implementation and subsequent review must preserve originals, restore source in `finally`, and obtain both red and green logs through `hospital.py run-test`. Approval here covers the plan only; merge readiness remains unproven.

One execution caveat: `shared/test/mocks/fetch.ts` passes unmatched hosts to the original fetch. `TEST_VCR_MODE=replay-only` is not a universal network prohibition. Keep the exact worker-test filter and verify its request destinations remain covered by the existing mocks; any uncovered live dependency requires I-PASS rather than recording or probing it.

VERDICT: APPROVE

<!-- HOSPITAL:IMPLEMENT -->
2026-10-12 22:38:50 UTC

## Fellow note: Case 16920, implement stage

I applied the cached PR diff without changes. The new tests fail against the base code for the reason the plan predicted and pass with the patch applied.

**Diff scope**
- `git apply /home/user/pollinations-hospital/cache/pr-16920.diff` succeeded on a clean `hospital/16920` at `43c9d81f5`. The branch is still at that commit.
- 3 files, +72/−10, all in `gen.pollinations.ai`:
  - `src/image/createAndReturnImages.ts` (+27/−?)
  - `test/image/gptImageRouting.test.ts` (+52)
  - `test/generation-vcr.test.ts` (+3/−1)
- I wrote no code of my own. The only expectation changes are the ones plan review approved: the refusal list grows to 401/402/403/404/429, the terminal list to 400/408/500/524, and the VCR `test.for` list gains 403.

**Reversal proof (red)**
- I saved a copy of the patched `createAndReturnImages.ts`, then put the base file back with `git checkout 43c9d81f5 -- <file>` and left the new tests in place. A shell `trap … EXIT` copied the patched file back.
- `cmp` afterwards printed `RESTORED`, and I deleted the scratch copy.
- `implement-1.log`: `TEST_VCR_MODE=replay-only npx vitest run test/image/gptImageRouting.test.ts` gave **7 failed / 22 passed (29), exit 1**. The 7 failures are exactly the ones plan review predicted:
  - `tries the other region after a 401`, `402` and `403`
  - `fails a 401/402/403 to the caller once every region refused`. These fail with `expected "spy" to be called 2 times, but got 1 times`, meaning the base code gives up after one region.
  - `tries the other region when Azure blocks one resource`. The base code throws the Azure "resource has been temporarily blocked" `UpstreamError` instead of trying the other region.
- `fails a content-policy refusal without trying another region` **passed at base** (log line 35), as expected. It protects the new content-policy exclusion; it is not evidence of the regression, and I don't count it as a red test.
- `implement-2.log`: `npx vitest run test/generation-vcr.test.ts -t "falls back to OpenAI direct"` gave **1 failed / 2 passed / 70 skipped, exit 1**.
  - `gpt-image-2 falls back to OpenAI direct on an Azure 403` failed with `expected 502 to be 200`: the base code ends the request instead of falling back to OpenAI direct.
  - The existing 429 and 404 cases passed.

**Patched code (green)**
- `implement-3.log`: gptImageRouting.test.ts gave **29/29 passed, exit 0**. That includes the original 19 baseline tests from `workup-1.log`, still green.
- `implement-4.log`: generation-vcr.test.ts with the same filter gave **3 passed / 70 skipped, exit 0**. The 429, 404 and 403 fallback cases all pass.
- `implement-5.log`: `npx biome check` on the 3 files reported `Checked 3 files … No fixes applied.`, exit 0.

**Network check (the caveat from plan review)**
- Every URL in `implement-4.log` is `https://gen.pollinations.ai`, which is the worker's own incoming request URL, not an outbound call. That's 6 occurrences, one request line and one response line per status.
- The test's host-keyed mocks (`generation-vcr.test.ts:375-395`) cover every host the filtered cases contact: `content-safety.test`, `gptimagemain1-resource…`, both `myceli-prod-img-2-{swedencentral,eastus2}` regions and `api.openai.com`.
- No unmatched host fell through to a real fetch, and nothing was recorded.

**Working tree**
- `git status` shows only the 3 PR files modified. Nothing is committed and no scratch files remain.

**Remaining gaps**
- There were no live Azure calls, by design.
- I didn't run `tsc` or the wider `test/image` / `fallback.test.ts` suites, because the protocol allows one file per command and no whole suites. The contributor's reported runs of those are not hospital evidence.
- The maintainer caveat from workup still stands: failing over on 401/402 can hide a bad or unpaid key in one region behind the healthy sibling. `logError` still records each region's failure.

VERDICT: APPROVE

<!-- HOSPITAL:REVIEW -->
2026-10-12 22:42:01 UTC

Review attending: no actionable merge blockers found in PR #16920.

- Confirmed `hospital/16920`; the driver-preserved implementation matches the cached PR diff: three files, +72/−10 lines. No plan drift or weakened assertions.
- The predicate at `createAndReturnImages.ts:472` serves both regional retries and the provider fallback at `handler.ts:293`. It preserves the `UserImageError` exclusion, adds 401/402/403, and keeps ambiguous timeouts and server failures terminal.
- The existing moderation helpers distinguish the tested Azure resource-block message from a content-policy refusal. No provider targets, credentials, prices, or usage calculations change.

Independent reversal evidence, all through `hospital.py run-test`, with `TEST_VCR_MODE=replay-only`:

| Log under `cases/16920/tests/` | Result |
|---|---|
| `review-1.log` — base source, PR routing tests | 7 failed, 22 passed; exit 1 |
| `review-2.log` — base source, filtered worker tests | 403 failed with 502 instead of 200; 429/404 passed; exit 1 |
| `review-3.log` — restored source, routing tests | 29 passed; exit 0 |
| `review-4.log` — restored source, filtered worker tests | 3 passed, 70 skipped; exit 0 |

The seven routing failures cover sibling-region recovery and exhaustion for 401/402/403, plus the explicit resource-block body. The content-policy test passed against both versions; it is protective coverage, not red regression evidence.

The worker tests verify fallback identity, one OpenAI request, and failed-attempt/final billed-event attribution. The filtered destinations are covered by existing mocks. Earlier formatter evidence in `implement-5.log` also passed.

I saved the patched source before reversal and restored it in `finally`; restoration was verified. The working tree is clean relative to the driver’s implementation commit. No review fixes or commits were made.

Verification is limited to offline routing and worker behavior; it does not establish live Azure availability or provider billing records. No unresolved blocker requires I-PASS.

VERDICT: APPROVE

<!-- HOSPITAL:DISCHARGE -->
2026-10-12 22:44:08 UTC

# Discharge note: Case 16920 (PR #16920, GPT Image Azure region failover on 401/402/403)

I checked the chart, the stage notes, the run-test logs under `cases/16920/tests/` and the branch record. I did not review the code itself.

## Checklist

| Item | Result | Evidence |
|---|---|---|
| Plan approved before implementation | PASS | Workup at 22:34:50 and plan review (APPROVE) at 22:36:28 both come before implementation at 22:38:50. Plan review approved the three test-table expansions as intended contract changes. |
| Implementation is the cached PR diff | PASS | `git diff 43c9d81f5 HEAD` compared with `cache/pr-16920.diff` differs only in index-hash length and the hunk offset of `generation-vcr.test.ts` (3245 vs 2938). The code content is identical, and the hospital wrote no code of its own. |
| Independent review | PASS | Review attending note (APPROVE) at 22:42:01, with its own red and green logs `review-1` to `review-4`. |
| Baseline before the patch | PASS | `workup-1.log`: `env TEST_VCR_MODE=replay-only npx vitest run test/image/gptImageRouting.test.ts`, 19/19 passed, exit 0. |
| Red logs (fix removed, new tests kept) | PASS | `implement-1.log` and `review-1.log`: routing tests, 7 failed / 22 passed, exit 1. The 7 failures are exactly the predicted ones: the 401/402/403 cases for "tries the other region" and "fails … once every region refused", plus "tries the other region when Azure blocks one resource". `implement-2.log` and `review-2.log`: `generation-vcr.test.ts -t 'falls back to OpenAI direct'`, 1 failed (the Azure 403 case) / 2 passed / 70 skipped, exit 1. |
| Green logs (fix restored) | PASS | `implement-3.log` and `review-3.log`: 29/29 passed, exit 0. `implement-4.log` and `review-4.log`: 3 passed / 70 skipped, exit 0. |
| Existing tests still green | PASS | All 19 baseline routing tests are inside the 29 that pass. The existing 429/404 VCR fallback cases pass in both the red and green runs. |
| Protective test not counted as red evidence | PASS | The content-policy case passes on the base code too. Implement and review both said so explicitly. |
| No weakened tests | PASS | The only changes to existing expectations are the approved list expansions, and no assertions were removed. |
| Formatting | PASS | `implement-5.log`: `biome check` on the 3 files reported "No fixes applied.", exit 0. |
| Branch and commit record clean | PASS | Branch `hospital/16920` has a single driver commit `150260aff` on top of the base `43c9d81f5`. `git status --short` is empty, and no stray or recorded snapshot files are present. |
| Scope and size | PASS | 3 files in `gen.pollinations.ai`, +72/−10, far under the ~1,000-line limit. No sdk/ui/polli-cli change, so no version bump is needed. |
| Budget and rework | PASS | `state.json` shows `reworks: 0`. |
| Unresolved blockers | PASS | None. No stage raised an I-PASS. |

## Minor finding (not a blocker)
- **What:** the logs for implement-1 to 4 and review-1 to 4 record `npx vitest run …` with no `TEST_VCR_MODE=replay-only` prefix. `run-test` logs only the argv after `--`, so if the variable was exported before the wrapper, the log can't show it. The default in `vitest.config.ts:161-162` is `replay-or-record`.
- **Why it doesn't block:**
  - `gptImageRouting.test.ts` doesn't use VCR at all.
  - In `generation-vcr.test.ts` the VCR covers only the `portkey` host, and its `originalFetch` is `fakeUpstreamFetch` (`generation-vcr.test.ts:438-441`).
  - The working tree shows no new snapshot files.
  - The implement note confirms the only URL the filtered cases log is the worker's own incoming request URL.

  Nothing was recorded and nothing reached the network.
- **For future runs:** put the variable after `--` (as `workup-1.log` does with `env TEST_VCR_MODE=…`) so the log shows it.

## Limits for the maintainer
- These are local, offline targeted tests, not GitHub CI. `tsc`, the wider `test/image` folder and `fallback.test.ts` were not run in the hospital; the contributor's own runs of them aren't hospital evidence.
- No live Azure calls were made, so live region behaviour and provider billing records are unverified.
- **Open product question:** failing over on 401/402 lets a bad or unpaid key in one region be hidden by the healthy sibling region. Each regional failure is still logged through `logError`, but a maintainer should decide whether that is acceptable.

Every applicable item passes. Nothing was merged, committed or published.

VERDICT: APPROVE

<!-- HOSPITAL:CLOSED -->
2026-10-12 22:44:08 UTC

Local dry-run discharge only. Audit passed; nothing published.
