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

<!-- HOSPITAL:OPERATOR -->
2026-10-12 21:55:32 UTC

Reopened by the operator. The reworked workup was refused because the account had run out of paid Pollen; Thomas topped it up. Run the rework workup again, addressing the plan review note above.

<!-- HOSPITAL:WORKUP -->
2026-10-12 22:00:04 UTC

I'm approving the reworked plan. The red run now gets an offline fetch stub that is limited to the PR's new test and is always reverted. The PR's own diff has no merge blocker.

## Workup note (rework): case 17045 (PR #17045)

**Admission check (unchanged)**
- PR #17045 is open and not a quest. It fixes issue #17044, which is open.
- It is small (+8/−1 in the source, +25 in the test) and touches only gen, so no version bump is needed.
- No other open PR mentions this case.
- The precedents check found P1 (no live or paid verification), which this plan addresses directly.

**Call path and source assessment (confirmed again, unchanged)**
- `params.ts:284` sets `dimensionsExplicit` before defaults are filled in.
- `callInferencePortImage` in `src/image/models/inferencePortImageModel.ts:53-62` never sends dimensions upstream. The PR's guard runs first, before the API-key lookup, `requireSafePrompt`, the reference-image downloads and `fetch`. It returns 400 in the same way as the existing `transparent` rejection.
- Omitted dimensions and sizes inferred during edits stay `dimensionsExplicit: false`, so those requests are still accepted.

**Answer to the plan-review blocker**
- **Confirmed:** the new `it.each` uses `vi.spyOn(globalThis, "fetch")` with no mock, so a call goes through to the real fetch.
- `test/setup/public-tinybird-pipes.ts:27` only answers three Tinybird pipes and sends every other request to `networkFetch`.
- `vitest.config.ts:128` has no fetch interceptor, and vitest 3.2.4 has no `--setupFiles` command-line flag.
- Without the guard, the call would get past the guard and `requireSafePrompt`, then reach `fetch(https://api.inferenceport.ai/…)` at line 85 using `test-ip-key`. The red run therefore needs an offline stub.
- Azure Content Safety (`analyzeContent`, `azureContentSafety.ts:80`) also uses global `fetch`, so one stub on `globalThis.fetch` covers both outbound calls.

**Revised treatment plan**
1. Back up `src/image/models/inferencePortImageModel.ts` and `test/image/inferencePortImageModel.test.ts` to `/tmp/hospital-17045/` before any change.
2. Apply the cached diff from `/home/user/pollinations`: `git apply /home/user/pollinations-hospital/cache/pr-17045.diff`.
3. Save copies of both files as patched to the same backup directory.
4. **Temporary offline harness.** It is never committed and does not weaken the test:
   - Edit only the new `it.each` block, at line 176 after patching: change `const fetchSpy = vi.spyOn(globalThis, "fetch");` to `const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => successResponse());`.
   - Using `mockImplementation` returns a fresh `Response` on every call, so a reused body can't give a misleading error.
   - All assertions stay exactly as they are (`rejects.toMatchObject({status: 400, …})`, `fetchSpy` not called).
   - The transparent test at line 156 has the same spy line and must not be touched; target the line by number and check it with `sed -n 171,177p`.
5. **Red run:** restore the base `inferencePortImageModel.ts`, keeping the stubbed test. Run the steps inside a shell `trap`/`finally` that puts the patched files back if any command fails.
   - Command, from `gen.pollinations.ai/`: `python3 /home/user/pollinations-hospital/hospital.py run-test -- env TEST_VCR_MODE=replay-only npx vitest run test/image/inferencePortImageModel.test.ts`
   - Expected: the 3 new cases fail with "promise resolved … instead of rejecting" because the stub returns a successful image. The 13 existing tests stay green.
   - A failure caused by networking or authentication is ruled out, because every fetch is answered in-process.
6. **Stubbed green run:** restore the patched source, keeping the stubbed test, and run the same command. Expected: 16 of 16 pass. This proves the guard stops before any fetch.
7. **Real green run:** restore the PR's unmodified test file and run the same command. Expected: 16 of 16 pass. This is offline, because step 6 proved the guard throws before `fetch`.
   - Then compare both files against the saved patched copies to confirm the tree is exactly base plus PR diff.
8. Lint the real files from `gen.pollinations.ai/`: `npx biome check src/image/models/inferencePortImageModel.ts test/image/inferencePortImageModel.test.ts`.
9. Release metadata: none needed. No registry, OpenAPI, `APIDOCS.md` or legal-document change, because data processing is unchanged.

**Baseline evidence**
- `tests/workup-1.log`: base commit, 13 of 13 passing, exit 0.

**Risks**
- **Contract change, intended by #17044:** callers who currently send other sizes and quietly get 1024×1024 will now get a 400. No existing test expectations change.
- **Harness risk:** editing the wrong spy line. Steps 4 and 7 mitigate this by verifying the line and comparing against the saved copies.
- **Size of the temporary edit:** a one-line test change that is fully reverted. The net change is the PR diff only, +33/−1.

**Merge blockers in the PR diff**
- None.
- The passthrough spy in the PR's test is not a merge blocker. It follows the existing transparent-test pattern, and it is safe as long as the guard exists.
- A non-blocking suggestion for review: stub fetch in the "before calling upstream" tests so that a future regression fails offline.

**I-PASS (for plan review)**
- **Severity:** routine.
- **Summary:** small validation PR. The source is correct, and the verification gap from the last review is closed by the offline stub limited to the new test.
- **Actions:** steps 1–8 above.
- **Risk:** the stub must be applied only in steps 5–6 and removed before step 7.
- **Synthesis to confirm:** in the red log, the 3 cases should fail because the promise resolved, not because of networking.

VERDICT: APPROVE

<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-12 22:02:01 UTC

The revised plan is approved for implementation and subsequent review. No blocker in the contributor’s production diff was identified.

- **Scope:** Checkout is clean on `hospital/17045` at `90e652b5d0b7d30af6a71f2631cb4f12fc68579e`. Implementation remains limited to applying cached `pr-17045.diff`; the temporary fetch stub must be fully removed afterward.
- **Correctness:** Cached issue #17044 explicitly requests rejection of unsupported dimensions. `params.ts:284` records explicit dimensions before supplying defaults. `routes/images.ts:94` preserves omitted dimensions, and `handler.ts:363` preserves the flag when inferring edit dimensions. The adapter’s new guard therefore rejects explicit non-1024×1024 requests while retaining omitted-size behavior.
- **Offline verification:** The proposed `.mockImplementation(async () => successResponse())` closes the previous blocker. Both generation and optional Azure safety requests use global `fetch`. The fresh response contains valid image data and usage; Azure treats its absent category analysis as empty (`azureContentSafety.ts:107`). Prompt logging has no network side effect.
- **Meaningful regression signal:** With only production validation reversed, the three added cases should fail because generation resolves instead of rejecting. Existing assertions remain unchanged. Restore production validation for the stubbed green run, then restore the exact PR test for the final green run. Require all 13 existing tests to remain green throughout.
- **Restoration and execution:** Keep restoration in `try/finally` or an equivalent trap and compare both final files with saved patched copies. Route every verification command, including lint, through `hospital.py run-test`. Run Biome separately for each changed file to follow the protocol’s one-file-per-command rule.
- **Evidence boundary:** `tests/workup-1.log` records the baseline’s 13 passing tests and exit 0. No tests or edits were performed during this plan-review stage. Approval of the completed change still requires logged expected-red and green results.

I-PASS: Routine handoff. Proceed with the revised offline plan. Stop if the red failures arise from authentication, networking, or another unintended cause; the receiving reviewer must confirm the expected failure signal, green results, and exact restoration to the cached PR diff.

VERDICT: APPROVE

<!-- HOSPITAL:IMPLEMENT -->
2026-10-12 22:04:30 UTC

## Implementation note: case 17045 (PR #17045)

The cached PR diff is applied and the tree matches it exactly. The new tests fail for the right reason when the fix is removed, and pass when it is back. The temporary fetch stub is gone.

**Diff scope**
- Applied `cache/pr-17045.diff` to `hospital/17045`, base `90e652b5d`, with `git apply`. `--check` passed first.
- `git diff --stat`: 2 files, +33/−1.
  - `gen.pollinations.ai/src/image/models/inferencePortImageModel.ts` (+8/−1): the dimension guard.
  - `gen.pollinations.ai/test/image/inferencePortImageModel.test.ts` (+25): an `it.each` with 768×1024, 1024×768 and 1536×1536.
- The contributor's diff was not changed. No release metadata, registry, OpenAPI, `APIDOCS.md` or legal-document changes are needed (gen Worker only).
- Before any edit, the base and patched copies of both files were saved to `/tmp/hospital-17045/{base,patched}/`.

**Temporary offline harness (approved plan step 4)**
- Only line 176 was edited: the spy in the new `it.each`. It became `vi.spyOn(globalThis, "fetch").mockImplementation(async () => successResponse())`.
- I checked with `sed -n 155,156p` that the transparent test's spy at line 156 was not touched.
- Every assertion stayed the same.
- Both stubbed runs ran inside a shell `trap … EXIT` that copies the patched source and test back. Both runs printed `RESTORED`.

**Test evidence (all via `hospital.py run-test`, run from `gen.pollinations.ai/`)**

| Log | State | Command | Result |
|---|---|---|---|
| `implement-1.log` | base source + stubbed PR test (red) | `env TEST_VCR_MODE=replay-only npx vitest run test/image/inferencePortImageModel.test.ts` | **3 failed, 13 passed (16), exit 1** |
| `implement-2.log` | PR source + stubbed PR test | same | 16/16 passed, exit 0 |
| `implement-3.log` | exact PR files (after `cmp` against the saved patched copies: `EXACT_PR`) | same | 16/16 passed, exit 0 |
| `implement-4.log` | lint | `npx biome check src/image/models/inferencePortImageModel.ts` | clean, exit 0 |
| `implement-5.log` | lint | `npx biome check test/image/inferencePortImageModel.test.ts` | clean, exit 0 |

**Why the red run failed**
- All three new cases failed at `test/image/inferencePortImageModel.test.ts:189` (`.rejects.toMatchObject`) because the promise resolved instead of rejecting.
- The resolved value was the stubbed success result: `buffer` holding the bytes "inferenceport-output", and `trackingData.actualModel: "inferenceport-ai/lightning-image-turbo"`, usage 1.
- So without the guard, the adapter goes on to generate and bill at 1024×1024. That is exactly the bug in #17044.
- Nothing points to a network or auth failure: every fetch was answered in-process.
- All 13 tests that existed before stayed green in all three runs, matching the baseline in `workup-1.log` (13/13).

**Final tree state**
- `git status --short` shows only the two PR files modified.
- Both files match the saved patched copies byte for byte (`cmp`).
- The stub is fully removed. Nothing was committed, as instructed.

**Remaining gaps (non-blocking, for review)**
- The PR's new test uses a passthrough `fetch` spy, the same pattern as the existing transparent test. It is offline only while the guard exists: if the guard ever regresses, the test would try the real provider instead of failing cleanly offline. A later stage could suggest having the "before calling upstream" tests stub fetch; this doesn't block merge.
- I didn't run `npm run typecheck` because the protocol limits each command to one file. Biome passed on both files, and the change uses existing `ImageParams` fields (`dimensionsExplicit`, `width`, `height`) already read by `params.ts`.
- Intended contract change from #17044: explicit sizes other than 1024×1024 now return 400 instead of silently giving 1024×1024. No existing expectations were modified.

**I-PASS**
- **Severity:** routine.
- **Summary:** small validation PR, applied exactly. Red and green results are logged as `implement-1` to `implement-3`, lint as `implement-4` and `implement-5`.
- **Actions for review:** confirm the red failure in `implement-1.log` is the "resolved instead of rejected" signal at line 189, and that the final tree is base plus the PR diff only.
- **Risk:** the passthrough-spy weakness above. No billing, auth or fallback paths are touched.
- **Synthesis to confirm:** the guard rejects explicit non-1024×1024 requests before any upstream call, and omitted sizes behave as before.

VERDICT: APPROVE

<!-- HOSPITAL:REVIEW -->
2026-10-12 22:06:37 UTC

Review complete: no merge-blocking production defects or plan drift found.

- The guard at `gen.pollinations.ai/src/image/models/inferencePortImageModel.ts:57` rejects explicit unsupported dimensions with HTTP 400 before provider calls. Parameter parsing preserves omitted dimensions and inferred edit dimensions; both retain existing behavior.
- Cached issue #17044 explicitly requests this behavior change. Auth, provider usage accounting, routing, and pricing remain unchanged.
- The final diff matches cached `pr-17045.diff`; only Git’s displayed hash abbreviation differs. The worktree is clean on `hospital/17045`. All temporary edits were restored through `try/finally`. No commits were made during review.

Independent verification, logged under `/home/user/pollinations-hospital/cases/17045/tests/`:

| Evidence | Result |
|---|---|
| `review-1.log`: base source, approved offline stub | Three new cases failed because generation resolved instead of rejecting; 13 existing tests passed. Exit 1. |
| `review-2.log`: restored production guard, offline stub | All 16 tests passed. Exit 0. |
| `review-3.log`: exact PR source and tests | All 16 tests passed. Exit 0. |
| `implement-4.log`, `implement-5.log`: inspected lint evidence | Each changed file passed Biome. Exit 0. |

Non-blocking test concern: `test/image/inferencePortImageModel.test.ts:176` uses a passthrough fetch spy. If validation regresses, the unmodified test could contact the provider. Returning `successResponse()` from that spy would make future failures deterministic and offline. The approved temporary harness supplied this protection for the red run without changing assertions.

Verification was limited to offline adapter tests and source inspection; no live-provider or production behavior was tested.

VERDICT: APPROVE

<!-- HOSPITAL:DISCHARGE -->
2026-10-12 22:10:09 UTC

# Discharge note: case 17045 (PR #17045, "fix(image): validate Lightning Image Turbo dimensions")

Every applicable item passes, so I'm discharging the case. This covers local, offline evidence only; GitHub CI has not been checked.

## Checklist

| # | Item | Evidence | Result |
|---|---|---|---|
| 1 | Admission: open, not a quest, small, no package version bump needed | Chart admission: only `gen.pollinations.ai` changes, +33/−1, fixes #17044 | PASS |
| 2 | The plan was approved before implementation | Chart order: WORKUP (21:00) → PLAN_REVIEW REWORK (21:02) → failed workup that ran out of credits → OPERATOR reopen (21:55) → WORKUP rework (22:00) → PLAN_REVIEW APPROVE (22:02) → IMPLEMENT (22:04) | PASS |
| 3 | A different model reviewed the work | `plan-review-1/2.log` and `review-1.log` were run by Codex `openai/gpt-6-astra`; workup and implement were run by `anthropic/claude-opus-5.5` | PASS |
| 4 | The plan-review blocker was resolved | A real network call during the red run was the blocker. The rework added a temporary `.mockImplementation(async () => successResponse())` stub limited to the PR's new test. In both red logs the failure is `AssertionError: promise resolved "{ …(2) }" instead of rejecting`. No ECONN, fetch, 401/403 or network errors appear in `implement-1.log` or `review-1.log` | PASS |
| 5 | Red run-test logs exist with commands and exit codes | `implement-1.log` and `review-1.log`: `env TEST_VCR_MODE=replay-only npx vitest run test/image/inferencePortImageModel.test.ts`. Result: 3 failed \| 13 passed (16), **exit 1**. The three failures are exactly the new 768×1024, 1024×768 and 1536×1536 cases | PASS |
| 6 | Green run-test logs exist | `implement-2.log` and `review-2.log` (fix plus stub): 16/16, exit 0. `implement-3.log` and `review-3.log` (exact PR files): 16/16, exit 0 | PASS |
| 7 | Existing tests stay green and none are weakened | Baseline `workup-1.log`: 13/13, exit 0. All 13 stay green in every later run. No existing expectations changed | PASS |
| 8 | Lint passes, one file per command | `implement-4.log` and `implement-5.log`: Biome passed on each file ("No fixes applied"), exit 0 | PASS |
| 9 | No unexpected scope: the tree is exactly the PR diff | I compared the +/- lines of `git diff 90e652b5d HEAD` with `cache/pr-17045.diff`: **identical** (`SAME_DIFF`). Stat is 2 files, +33/−1. The temporary stub is not in the tree | PASS |
| 10 | Branch and commit record is clean | Branch is `hospital/17045`. One commit since base, `66155b306 hospital: implement case 17045`, preserved by the driver. `git status --short` shows nothing | PASS |
| 11 | Rework cap holds | `state.json` shows `reworks: 1`, under the cap of 2 | PASS |
| 12 | Size limit holds | 34 changed lines, far below the ~1,000 decomposition threshold | PASS |
| 13 | Budget limits hold | I called `hospital.costs` read-only: **case 7.83 Pollen** (claude 4.86, codex 2.97) against run.json `case_limit` 8. **Run total 7.83 Pollen** against `trial_limit` 10. Run 1's total of 10.66 (P4) is not exceeded | PASS, but close to the limit |
| 14 | No unresolved blockers | The review note (22:06) found no merge blockers or drift from the plan. The only earlier I-PASS was the run out of credits, which the operator reopened | PASS |
| 15 | Safety rules (P1) | No GitHub writes, live or paid calls, secrets, or Enter tests. Every fetch in the red and green runs was answered locally by the stub | PASS |

## Notes for the maintainer (not blocking)

- **Fragile test spy:** at `test/image/inferencePortImageModel.test.ts:176` the PR's new test uses a `fetch` spy that calls the real `fetch`. If the guard ever breaks, that test would try to reach the real provider instead of failing offline. Both review stages suggested having the spy return `successResponse()`. Raising that with the contributor is optional.
- **Typecheck not run:** no `npm run typecheck` was run, so there is no log for it. GitHub CI is the authority for typecheck and for the wider suite.
- **Intended behaviour change, requested in #17044:** callers who explicitly ask for a size other than 1024×1024 now get a 400. Before, they silently got 1024×1024. Requests that leave dimensions out, and edit requests where the size is inferred, behave as before.
- **Cost:** this case used about 7.8 of its 8 Pollen. A second failed workup that ran out of credits, and its reopen, account for part of that. The run has about 2.2 Pollen left under `trial_limit`.

## I-PASS

- **Severity:** routine.
- **Summary:** a small validation fix for the Lightning Image Turbo dimensions in the gen Worker. The tree is exactly the PR diff, the red runs fail for the right reason, and the green runs and lint pass. All of this is logged through run-test.
- **Actions:** the maintainer decides whether to merge after GitHub CI passes. Optionally, suggest the spy change to the contributor. The hospital did no merging or publishing.
- **Situation/risk:** low. Billing, auth, routing and pricing are not touched.
- **Synthesis to confirm:** the guard returns a 400 for any explicit size other than 1024×1024 before any call to the provider, and requests that leave the size out behave the same as before.

VERDICT: APPROVE

<!-- HOSPITAL:CLOSED -->
2026-10-12 22:10:09 UTC

Local dry-run discharge only. Audit passed; nothing published.
