# Case 16717
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-11 21:12:03 UTC

Kind: pr
Start: 2026-10-11 21:12:03 UTC
Branch: hospital/16717
Base: 404135d0e92e0bec0ab7ee761f1dd3034360a07a
Source: https://github.com/pollinations/pollinations/pull/16717
fix(mcp): preserve requested log probabilities in generateText responses
Open PRs that mention this case: none in cache

<!-- HOSPITAL:WORKUP -->
2026-10-11 21:14:45 UTC

I've approved the plan for PR #16717. The cached diff applies cleanly to the base and I found nothing that would block merge.

<!-- HOSPITAL:WORKUP -->
**Workup — Case 16717 (PR, fix(mcp): pass logprobs through in generateText)**

**Admission check**
- The PR is open, not a quest and not a draft. Its body says `Fixes #16716`, and no other cached PR covers it.
- It touches 2 files: `packages/mcp/src/services/textService.js` (+1 line) and `packages/mcp/test/textService.test.js` (+26 lines). That makes it trivial.
- It can be checked offline: the test replaces `globalThis.fetch` with a stub, so nothing reaches the network, and no secrets or Enter are involved.
- `git apply --check` of `cache/pr-16717.diff` against `404135d0e` passes.

**Diagnosis**
- `generateText` (`textService.js:10-37`) already accepts `logprobs` and `top_logprobs` (schema at `textService.js:380-390`) and sends them upstream through `postChatCompletion` (`coreUtils.js:123`).
- The response, however, only returns `model`, `finish_reason` and `usage` (`textService.js:150-160`). `choice.logprobs` is dropped, so a caller who asks for log probabilities never gets them.
- The fix adds `logprobs: choice?.logprobs` to that block. It passes the API response through unchanged, which is what `packages/mcp/AGENTS.md` asks for ("Don't transform response data").
- Callers who don't request logprobs see no change. In that case `choice.logprobs` is `undefined`, and `JSON.stringify` (`coreUtils.js:62`) leaves the key out.

**Test review**
- The new test stubs `fetch` in the same way as the existing tests (`accountService.test.js:58`, `audioService.test.js:13`) and restores it with `t.after`.
  - It answers `/text/models` with `[{name:"test-model"}]`, which satisfies `validateTextModel`.
  - It answers the chat completion with a choice that contains `logprobs`.
- It passes the auth context as `{http:{authInfo:{token}}}`, the shape `authUtils.js:2` reads.
- It checks the last content block. That is the metadata block, which is always pushed last (`textService.js:150`).
- On the base it should fail because `.logprobs` is `undefined` and `deepEqual` will not match. That is the intended reason, and review will confirm it.

**Baseline evidence**
- `node --test test/textService.test.js` on the base: 1 pass, exit 0 (`cases/16717/tests/workup-1.log`).

**Treatment plan**
1. Apply the cached diff exactly: `git apply /home/user/pollinations-hospital/cache/pr-16717.diff` from the repo root. Nothing else changes.
2. Red: save the original `textService.js`, then temporarily remove the added `logprobs: choice?.logprobs,` line. Run the test from `packages/mcp`:
   `python3 /home/user/pollinations-hospital/hospital.py run-test -- node --test test/textService.test.js`
   Expect the new test to fail on the `deepEqual` of `logprobs` (actual `undefined`) and the existing test to still pass.
3. Green: restore the line, rerun the same command, and expect 2 of 2 passing.
4. Optionally run `npx biome check` on the 2 files. That is a read-only check without `--write`; changes to the PR are advisory only.
- **Single test file and runner:** `packages/mcp/test/textService.test.js` with `node --test`.
- **Release metadata:** none needed. `pollinations-mcp-core` is `"private": true` and doesn't publish to npm. The recent MCP fixes (#16636, #16616) didn't bump its version either.
- **Size:** 27 added lines, 0 deleted.

**Risks**
- Low. The change only adds a field that callers explicitly requested.
- The model listing logprobs output size, since `top_logprobs` can go up to 20 per token, is a natural consequence of the caller's request. It is not a reason to block.
- No API docs, registry, billing or auth paths are affected.

**Merge blockers in the diff:** none.

VERDICT: APPROVE


<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-11 21:15:53 UTC

<!-- HOSPITAL:PLAN-REVIEW -->

Plan approved for applying the cached PR diff exactly. No actionable blocker found in the plan or contributor’s diff.

- Confirmed clean branch `hospital/16717` at base `404135d0e92e0bec0ab7ee761f1dd3034360a07a`; cached diff passes `git apply --check`.
- `packages/mcp/src/services/textService.js:71` forwards `logprobs` and `top_logprobs`, but the metadata block at line 150 drops the returned probabilities. The added field addresses that loss directly.
- `packages/mcp/src/server.js:72` registers the handler with its input schema and no output filter. The schema accepts the requested parameters.
- The regression invokes the real handler, supplies valid request auth context, stubs both fetches, and compares serialized metadata with the supplied probabilities. It should fail specifically because the base omits `logprobs`. Fetch restoration uses `t.after`.
- Existing evidence: `tests/workup-1.log` records the baseline’s single test passing, exit 0. The hosted caller test at `apps/mcp/worker.test.js:152` has no expectation incompatible with the added metadata.

One precision correction: unchanged output is guaranteed when upstream **omits** `logprobs`. If upstream returns `logprobs: null`, the new response preserves that null. This matches the package’s pass-through policy and does not require rework.

Subsequent implementation/review must retain the planned red/green gate: keep the added regression, temporarily remove only the production addition, run the single test file through `hospital.py run-test`, restore saved contents in `finally`, and rerun. Require the existing test to pass in both runs and the regression to fail for the intended reason before passing.

No files changed or tests run during this plan-review stage. This approves the bounded plan; merge approval remains dependent on recorded red/green evidence.

VERDICT: APPROVE

<!-- HOSPITAL:IMPLEMENT -->
2026-10-11 21:17:13 UTC

<!-- HOSPITAL:IMPLEMENT -->
**Implement: Case 16717 (PR, fix(mcp): preserve requested log probabilities in generateText responses)**

I applied the cached PR diff exactly as written. The new test fails without the fix, for the reason the plan predicted, and passes with it. The existing test passes in both runs.

**What I applied**
- Branch `hospital/16717` at base `404135d0e92e0bec0ab7ee761f1dd3034360a07a`. The working tree was clean before I started.
- I ran `git apply /home/user/pollinations-hospital/cache/pr-16717.diff` from the repo root. I changed nothing beyond the PR.
- `git diff --stat` shows 2 files changed, 27 lines added, 0 deleted:
  - `packages/mcp/src/services/textService.js`: 1 line added, `logprobs: choice?.logprobs,` in the metadata block (around line 157).
  - `packages/mcp/test/textService.test.js`: 26 lines added, the test "generateText returns requested token log probabilities".

**Red run (fix line temporarily removed)**
- I saved a copy of `textService.js` outside the repo. A shell `trap … EXIT` put it back even if a command failed. I then deleted only the added `logprobs` line, so the new test stayed in place.
- Command, run from `packages/mcp`: `python3 …/hospital.py run-test -- node --test test/textService.test.js`
- Log: `cases/16717/tests/implement-1.log`. Exit 1, with 1 pass and 1 fail.
  - The existing test, "accepts assistant tool calls with null content…", passed.
  - The new test failed with `AssertionError … deepStrictEqual`: it got `undefined` where it expected `{ content: [{ token:'Hi', logprob:-0.1, top_logprobs:[] }] }`, at `test/textService.test.js:55`.
  - That is the failure the plan predicted: without the fix, the response's metadata has no `logprobs`. Nothing else in the setup (the model lookup, auth, the fetch stub) caused it.

**Restore**
- After the red run, `cmp` showed `textService.js` byte-for-byte identical to the saved copy. I then deleted the copy.
- `git diff --stat` again shows exactly the PR's 2 files, +27 lines.

**Green run (fix in place)**
- Same command and directory.
- Log: `cases/16717/tests/implement-2.log`. Exit 0, with 2 of 2 tests passing.

**Lint**
- `npx --no-install biome check` on the 2 changed files reported "Checked 2 files… No fixes applied." This was a read-only check with no `--write`.

**Gaps and notes**
- I ran only the single test file, as the protocol requires; `apps/mcp/worker.test.js` was not run. Plan review found it has no expectation that conflicts with the new metadata field.
- As plan review noted, if the upstream API returns `logprobs: null`, the response now passes that null through. That matches the package's rule of not transforming response data, and it doesn't block merge.
- No version bump is needed because `pollinations-mcp-core` is private and not published to npm.
- Nothing reached the network: the test stubs `fetch` and needs no secrets. I made no commits and no GitHub writes. The PR's changes are left uncommitted in the working tree for the driver.

**Merge blockers in the PR diff:** none.

VERDICT: APPROVE


<!-- HOSPITAL:REVIEW -->
2026-10-11 21:18:19 UTC

<!-- HOSPITAL:REVIEW -->

No actionable findings or merge blockers in PR #16717.

- The change at `packages/mcp/src/services/textService.js:157` preserves upstream `choice.logprobs` in the serialized MCP metadata. The input schema accepts `logprobs` and `top_logprobs`, the request forwards them, and server registration applies no output filter.
- Missing upstream probabilities remain omitted by JSON serialization; explicit `null` passes through. Existing text, usage, authentication, and request behavior are preserved.
- The regression calls the real handler with stubbed fetch responses and restores fetch afterward. No existing expectations were modified.

Independent verification used `hospital.py run-test -- node --test test/textService.test.js` from `packages/mcp`:

- **Red — `tests/review-1.log`:** temporarily removed only the production addition, retaining the regression. Exit 1: the existing test passed; the regression failed at line 55 because probabilities were `undefined`.
- **Green — `tests/review-2.log`:** restored the saved source bytes in `finally`. Exit 0: both tests passed.

The complete change against base `404135d0e92e0bec0ab7ee761f1dd3034360a07a` matches the cached PR diff exactly: two files, 27 additions. Branch remains `hospital/16717`; the working tree is clean at the driver-preserved implementation commit. This review made no commits or lasting edits.

Verification was offline and limited to the approved test file. The hosted caller test was inspected, not executed. No live services, secrets, installations, or external writes were needed.

VERDICT: APPROVE

<!-- HOSPITAL:DISCHARGE -->
2026-10-11 21:20:05 UTC

Discharge note for case 16717 (PR #16717, fix(mcp): preserve requested log probabilities in generateText responses).

**Checklist**

1. **The plan was approved before any code changed: PASS.**
   - Workup approved the plan at 21:14:45 and plan review approved it at 21:15:53.
   - Implementation came after both, at 21:17:13. The chart and the file times agree (`workup-1.md` 21:14, `plan-review-1.md` 21:15, `implement-1.md` 21:17).
   - The plan was to apply the cached PR diff exactly, with nothing else.

2. **An independent model reviewed it: PASS.**
   - `plan-review-1.log` and `review-1.log` both start with the header `OpenAI Codex v0.162.1 … model: openai/gpt-6-astra`.
   - Workup and implement ran on the Claude side, so plan review and code review were done by a different model.

3. **Red and green run-test logs exist, with commands and exit codes: PASS.**
   - Every log records `$ cd …/packages/mcp && node --test test/textService.test.js`, the single file the plan named.
   - `tests/workup-1.log` (base): 1 pass, exit 0.
   - `tests/implement-1.log` (red, fix line removed): exit 1.
     - The existing test passed.
     - The new test failed with `deepStrictEqual`: the response's `logprobs` was `undefined`, compared with the expected value at `test/textService.test.js:55`. That is the failure the plan predicted.
   - `tests/implement-2.log` (green): 2 of 2 pass, exit 0.
   - `tests/review-1.log` and `tests/review-2.log`: the reviewer repeated the red and green runs on their own and got the same results (exit 1, then exit 0).
   - The existing test passed in every run.

4. **No blockers are left open: PASS.** Workup, plan review, implement and review all return APPROVE and report no merge blockers.
   - Plan review raised one point: if the API returns `logprobs: null`, the response now passes that null through.
   - This matches the MCP package's rule of not transforming response data, and every stage accepted it.

5. **No tests were weakened and nothing is out of scope: PASS.**
   - `git diff 404135d0e HEAD` has no deleted lines.
   - Only 2 files changed, with 27 lines added: `packages/mcp/src/services/textService.js` (+1) and `packages/mcp/test/textService.test.js` (+26).
   - The added and removed lines match `cache/pr-16717.diff` exactly (`DIFF_MATCH`).
   - No existing expectation was changed.

6. **The branch and commit record is clean: PASS.**
   - The current branch is `hospital/16717`, and `git status --short` shows nothing.
   - `HEAD` is `f844fcf00 hospital: implement case 16717`. It is the driver's commit, and it sits directly on base `404135d0e`.
   - `state.json` shows `reworks: 0` and `next: discharge`.

7. **Size and budget limits hold: PASS, but the run is close to its total limit.**
   - Size: 27 lines changed, far below the roughly 1,000-line point where a change has to be split up.
   - Case cost: about 3.45 Pollen since admission at 21:12:03, under `run.json`'s `case_limit` of 4.
   - Run cost: about 9.15 Pollen since the run started at 20:50:21, under the `trial_limit` of 10 and under P4's limit of 10.66.
   - These figures come from `usage-ledger.json`, which runs up to 21:19:15. The driver should check them again before admitting another case, because the run has under 1 Pollen left.

8. **Release metadata: not applicable.** `pollinations-mcp-core` is a private package that doesn't publish to npm, so it needs no version bump. Workup confirmed this.

**Limits of this evidence**
- These are local, offline tests of one file only. They are not GitHub CI.
- `apps/mcp/worker.test.js` was read but not run.
- The biome lint check was read-only and is reported only in the implement note; it has no run-test log, and nothing in the verdict depends on it.
- Nothing was merged, published or pushed.

**Handoff to the maintainer**
- The PR diff is ready to merge as submitted.
- Before merging, confirm that GitHub CI passes on PR #16717.
- Confirm you accept that `null` logprobs from the API are now passed through.

VERDICT: APPROVE


<!-- HOSPITAL:CLOSED -->
2026-10-11 21:20:05 UTC

Local dry-run discharge only. Audit passed; nothing published.
