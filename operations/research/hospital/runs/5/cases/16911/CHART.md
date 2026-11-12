# Case 16911
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-13 01:16:28 UTC

Kind: pr
Start: 2026-10-13 01:16:28 UTC
Branch: hospital/16911
Base: d3309b1d8849059b8e008919825c899643fd65a8
Source: https://github.com/pollinations/pollinations/pull/16911
fix: do not cache chat streams that carry no output
Open PRs that mention this case: none in cache

<!-- HOSPITAL:WORKUP -->
2026-10-13 01:19:11 UTC

## Workup: case 16911 (PR #16911, "fix: do not cache chat streams that carry no output")

**Admission check**
- The PR is open and is not a quest (no labels, no POLLEN-QUEST reference). It fixes #14994; the Tinybird half already landed in #14999.
- It is small: +118/−11 lines in 2 files, `gen.pollinations.ai/src/utils/text-cache.ts` and `gen.pollinations.ai/test/text-cache.test.ts`.
- It doesn't touch sdk, ui or polli-cli, so no version bump is needed. Gen is a Worker with no release metadata.
- No other open PR in `cache/pulls.json` touches this code or #14994. #16909 is a separate change (non-stream reasoning → stream) and isn't in the base.
- It can be checked offline: the tests use a loopback Hono app with an in-memory R2 env.
- The repo is at base `d3309b1d8`. `git apply --check` on the cached diff succeeds.

**Call path**
- Every text-cache write goes through `createCaptureStream` (`src/utils/text-cache.ts:239`). The middleware adapter calls it at `src/middleware/text-cache.ts:61`, and its R2 write is skipped at line 288 when `isStreamingErrorResponse` is true.
- The PR replaces that check with `isUncacheableStream`, which skips the write when the stream either reports an error or is a Chat Completions stream with no output.
- Its claim that skipping stream writes is safe holds up. `createGenerationCache` sets `coordinate = streamRequested !== true` (`src/middleware/generation-cache.ts:222-227`) and only registers `generationCache` for coordinated requests. The dedup bypass is in `src/middleware/generation-deduplication.ts:154`. So a skipped stream write never reaches the "Generation completed without a durable cache entry" 503 (`generation-deduplication.ts:236`).
- The content-type gate (`text/event-stream`) is unchanged. Base already skipped writes for error SSE through the same gate, so the PR adds no new risk on the coordinated path.
- Responses API, Anthropic Messages and ping events have no `choices` array. `isEmptyChatStream` returns `false` for them, so they are cached as before. SSE comment lines are dropped by `sseData`.

**Diff review**
- The code follows Ponytail: small plain functions, one constant table, one call site. Extracting `sseData` removes duplication.
- `CHAT_OUTPUT_FIELDS` doesn't include `refusal`, which `src/text/responses/adaptedChat.ts:775` treats as output. A refusal-only stream would therefore not be cached. That only costs a cache miss (one extra billed origin call), not a wrong answer, and caching refusals is arguably undesirable anyway. I'm recording it as advisory, not a merge blocker.
- The PR states its limitation plainly: non-streaming empty completions are still cached, because the coordinator contract needs the cache entry. Changing that is out of scope here and is a maintainer decision.
- No existing expectations change; both new tests are additions.

**Baseline evidence**
- `TEST_VCR_MODE=replay-only npx vitest run test/text-cache.test.ts` on base: 14/14 passed, exit 0 (run-test log).

### Treatment plan
1. Preserve the original contents of both files, then apply the PR: `git apply /home/user/pollinations-hospital/cache/pr-16911.diff` from `/home/user/pollinations`.
2. Prove the new tests catch the bug: restore only `gen.pollinations.ai/src/utils/text-cache.ts` to base and keep the new tests. Run `python3 …/hospital.py run-test -- env TEST_VCR_MODE=replay-only npx vitest run test/text-cache.test.ts` from `gen.pollinations.ai`.
   - Expected: `does not cache chat streams without output` fails with `expected 'HIT' to be 'MISS'`.
   - `caches chat streams whose output is text or tool calls` should pass on base too, since it is a guard against over-skipping.
3. Restore the PR's `text-cache.ts` and rerun the same command. Expected: 16/16 pass.
4. Run one more existing file, `test/generation-deduplication.test.ts` (replay-only), to confirm the coordinated non-stream path is still green. This is the 503 path the PR's first commit broke in CI.
5. Run `npx @biomejs/biome check` on both files, read-only with no `--write`, to confirm formatting.
6. Review notes, advisory only: the `refusal` field omission, and the remaining non-stream gap belonging under #14994.

**Risks**
- A non-streaming request that still receives an event-stream body: the behaviour is the same as base's error-SSE skip, so this is unchanged.
- Some delta output field missing from the list: the cost is cache misses only, never a wrong replay.

**Estimate:** 0 new lines; apply the PR as is (+118/−11).

VERDICT: APPROVE

<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-13 01:21:07 UTC

Plan review cannot approve applying this PR as-is.

- **Blocker — valid refusal output becomes uncacheable.** The cached diff’s `CHAT_OUTPUT_FIELDS` omits `refusal` (`cache/pr-16911.diff:43`). This field is produced by existing code: `responses/chatResponse.ts:517–534` converts provider refusal events into Chat deltas, and `generateTextPortkey.ts:98–108` routes configured models through that adapter. A successful stream containing `delta.refusal: "No."`, terminal usage and `[DONE]` has output, but `isEmptyChatStream` returns true. Repeated identical requests therefore execute upstream again instead of receiving the existing cache benefit. For billable authenticated retries, the account/key owner pays again. The workup’s suggestion that caching refusals is undesirable does not establish an accepted policy change. The smallest correction is to recognize refusal output and add a cache-preservation regression in the contributor’s diff.

- **Verification gap — the planned coordinator check cannot catch the cited regression.** `test/generation-deduplication.test.ts:63–79` uses its own adapter, whose capture function writes the literal `"origin"`; it never invokes the changed text-cache utility. The existing `test/generation-vcr.test.ts:3019` case, `POST /text passes through empty assistant content`, exercises the actual route and checks status, empty output and billing telemetry. A revised plan should include that single case through `hospital.py run-test`, with replay-only mode, after confirming its fixtures remain offline.

- **Workup correction.** The cached diff intentionally excludes `content_blocks`, and the new empty-stream fixture includes a thinking-only block. The workup incorrectly lists `content_blocks` among detected output fields. The exclusion matches the thinking/signature shape used by `src/text/messages/stream.ts:15`; this mismatch alone is not a contributor-code blocker.

Evidence available: `cases/16911/tests/workup-1.log` records the unchanged text-cache baseline at **14/14 passed, exit 0**. Contributor-reported runs are not hospital evidence. No new tests were run during this plan-review stage; no source, tests or hospital records were modified. The checkout remains clean on `hospital/16911` at the specified base.

**I-PASS:** Severity: merge blocker for cache behavior. Patient: bounded two-file stream-cache PR with a reachable refusal-output omission. Actions: return the contributor diff for the narrow correction, then revise and independently approve the offline verification plan before application. Situation: current coverage protects text/tool output but permits valid refusal output to lose caching. Receiving maintainer must confirm any intentional refusal-cache policy change separately; none is evidenced here.

VERDICT: CHANGES

<!-- HOSPITAL:HANDOFF -->
2026-10-13 01:21:07 UTC

Plan review cannot approve applying this PR as-is.

- **Blocker — valid refusal output becomes uncacheable.** The cached diff’s `CHAT_OUTPUT_FIELDS` omits `refusal` (`cache/pr-16911.diff:43`). This field is produced by existing code: `responses/chatResponse.ts:517–534` converts provider refusal events into Chat deltas, and `generateTextPortkey.ts:98–108` routes configured models through that adapter. A successful stream containing `delta.refusal: "No."`, terminal usage and `[DONE]` has output, but `isEmptyChatStream` returns true. Repeated identical requests therefore execute upstream again instead of receiving the existing cache benefit. For billable authenticated retries, the account/key owner pays again. The workup’s suggestion that caching refusals is undesirable does not establish an accepted policy change. The smallest correction is to recognize refusal output and add a cache-preservation regression in the contributor’s diff.

- **Verification gap — the planned coordinator check cannot catch the cited regression.** `test/generation-deduplication.test.ts:63–79` uses its own adapter, whose capture function writes the literal `"origin"`; it never invokes the changed text-cache utility. The existing `test/generation-vcr.test.ts:3019` case, `POST /text passes through empty assistant content`, exercises the actual route and checks status, empty output and billing telemetry. A revised plan should include that single case through `hospital.py run-test`, with replay-only mode, after confirming its fixtures remain offline.

- **Workup correction.** The cached diff intentionally excludes `content_blocks`, and the new empty-stream fixture includes a thinking-only block. The workup incorrectly lists `content_blocks` among detected output fields. The exclusion matches the thinking/signature shape used by `src/text/messages/stream.ts:15`; this mismatch alone is not a contributor-code blocker.

Evidence available: `cases/16911/tests/workup-1.log` records the unchanged text-cache baseline at **14/14 passed, exit 0**. Contributor-reported runs are not hospital evidence. No new tests were run during this plan-review stage; no source, tests or hospital records were modified. The checkout remains clean on `hospital/16911` at the specified base.

**I-PASS:** Severity: merge blocker for cache behavior. Patient: bounded two-file stream-cache PR with a reachable refusal-output omission. Actions: return the contributor diff for the narrow correction, then revise and independently approve the offline verification plan before application. Situation: current coverage protects text/tool output but permits valid refusal output to lose caching. Receiving maintainer must confirm any intentional refusal-cache policy change separately; none is evidenced here.

VERDICT: CHANGES
