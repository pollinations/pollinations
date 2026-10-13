# Run 5 (2026-10-13, 00:09–01:32 UTC)

A head-to-head on two PR cases:
- First, two blind quick reviews per case: one by DeepSeek v4.1-flash and one
  by gpt-6.1-sol.
- Then the full hospital on the same cases, with the reviewer switched to
  gpt-6.1-sol.

Dry run: nothing was posted to GitHub. The box was killed after its records
were copied.

## What changed from run 4

- Iteration 4 harness (b6e02721cb):
  - `quick-review N --model M [--rival R]`: one review by one model on a
    scratch branch. It can't read the hospital's case files, and the hospital
    can't read it.
  - `admit N --rival R`: Thomas asked the hospital to compare #17045 with
    #17057, a competing PR for the same issue. The workup recommends one, and
    implementation applies that PR's diff.
  - The review attending runs Codex on `openai/gpt-6.1-sol` instead of
    `openai/gpt-6-astra`. That is 2/10 Pollen per million tokens instead of
    10/50.
  - No Codex proxy: #17123 fixed gen's `/v1/responses` on production.
- Quick reviews run through Claude Code with `--model`, so the two quick-review
  models get the same tools and prompt.
- Settings:
  - Key budgets: Claude 7, box key 2.5. The box key was narrowed to
    `profile` + `usage`.
  - `trial_limit` 10, `case_limit` 8, `max_cases` 2.
- Before admission, the operator checked both cases: they are open, are not
  quests, and their diffs apply to base `d3309b1d8`.

## Quick reviews

| Case | Model | Time | Verdict | Pollen |
|---|---|---:|---|---:|
| [#16911](quick/16911/gpt-6.1-sol.md) | gpt-6.1-sol | 2.5 min | CHANGES | 0.15 |
| [#16911](quick/16911/deepseek-v4.1-flash.md) | DeepSeek v4.1-flash | 10 min | none: stopped at the 600 s limit | 0.09 |
| [#17045 vs #17057](quick/17045/gpt-6.1-sol.md) | gpt-6.1-sol | 2.5 min | APPROVE #17057 | 0.18 |
| [#17045 vs #17057](quick/17045/deepseek-v4.1-flash.md) | DeepSeek v4.1-flash | 9.4 min | APPROVE #17057 | 0.09 |

- **#16911, gpt-6.1-sol:** `CHAT_OUTPUT_FIELDS` leaves out `refusal`, so a
  stream that only refuses is never cached. It proved this with a test that
  failed (expected `HIT`, got `MISS`). It also asked how entries that are
  already cached empty get cleared, since the PR only stops new writes.
- **#16911, DeepSeek:** ran four test commands and read the same code paths
  (refusal, the non-stream handler, the coordinator). It was still exploring
  when the 600 s limit stopped it, and its partial note has no findings.
- **#17045 vs #17057, both models:** recommend #17057.
  - DeepSeek's reasons:
    - The shared params schema already holds per-model rules (gpt-image-2,
      minimax, gemini-omni, grok).
    - #17045's adapter-only check throws `UpstreamError.fromProvider(400)`,
      which records the caller's input error as an upstream failure.
  - gpt-6.1-sol's reason: #17045's test file fails the repo's Biome format
    check, and CI rejects that.

## Hospital cases

| Case | Stages | Outcome | Pollen |
|---|---|---|---:|
| [#16911](cases/16911/CHART.md) PR: don't cache chat streams with no output | workup, plan review | changes requested | 1.28 |
| [#17045](cases/17045/CHART.md) PR: Lightning Image Turbo dimensions, with rival #17057 | workup, plan review, implement, review, discharge | discharged, with #17057 applied | 3.86 |

**#16911: changes requested at plan review.**

- **Workup** (Opus, 1.07) traced the change to `createCaptureStream`. It checked
  the PR's main safety claim against the generation coordinator: streams are
  not coordinated, so skipping their cache write can't cause the 503.
  - It found the `refusal` gap and rated it advisory, because the only cost
    is one extra billed call.
  - It noted that non-streamed empty answers are still cached, and that this
    part of #14994 stays open.
- **Plan review** (gpt-6.1-sol, 0.21) asked for changes:
  - It rated the `refusal` gap a merge blocker. A refusal is valid output, and
    the PR changes caching for it without a decision to do so.
  - The workup's planned coordinator test can't catch the bug. Its adapter
    never calls the changed code. `generation-vcr.test.ts:3019` would.
  - The workup said the code counts `content_blocks` as output. It doesn't;
    only the PR description says so.
- For a PR case, the driver closes at plan review when the reviewer asks for
  changes. So no implement stage ran.

**#17045 vs #17057: discharged, with #17057.**

- **Workup** (Opus, 1.89) ran the comparison and recommended #17057, for
  three reasons:
  - its check sits at the schema;
  - it is the only PR that tests that the default and an explicit 1024×1024
    are still accepted;
  - #17045's test file fails Biome.

  It rated #17057's repeated adapter check as advisory.
- **Plan review** (0.20) approved.
- **Implement** (0.48) applied #17057's diff unchanged. Results: 33/33 schema
  tests, 14/14 adapter tests, Biome clean.
- **Review** (0.18) did the run with the fix removed:
  - Red: exactly the 5 new schema cases and the 1 new adapter case failed.
  - Green: everything passed again with the fix restored.
- **Discharge** (1.13) passed all 14 items.
  - It raised one question: precedent P2 says to stop above 3 Pollen per case,
    but `run.json` allows 8. This case cost 3.86.
- Every test ran with `TEST_VCR_MODE=replay-only` inside `unshare -rn`, with
  only loopback up. That shuts the network gap run 4's plan review found
  (replay-only mode doesn't block the network). The `run-test` command lines
  now show the variable, as run 4 asked.
- **Biome changed since run 3.** In run 3, #17045's test file passed Biome.
  #17225 upgraded Biome to 2.5.15 on 2026-10-12, and the same file now fails.
  The blocker is real for CI, but `biome check --write` fixes it. It says
  nothing about the fix itself.

### Why DeepSeek ran out of time

Added after the run, from gen's records of the run's own calls:

| Review of #16911 | Model calls | Output tokens | of which reasoning | Model time |
|---|---:|---:|---:|---:|
| gpt-6.1-sol | 10 | 4,484 | 2,288 | 112 s |
| DeepSeek v4.1-flash (Fireworks) | 37 | 59,339 | 52,981 | 534 s |

- It hit the hospital's 600 s stage limit, not a provider timeout. All 37 calls
  succeeded; the slowest took 43 s.
- DeepSeek ran one shell command per call. gpt-6.1-sol batched several per
  call.
- DeepSeek wrote 13 times as much output, mostly reasoning. Per token it was
  faster (about 110 tokens/s), so the time went to how much it thought.
- The #17045 review needed the same: 29 calls, 55,051 reasoning tokens, and
  560 s in all, just under the limit. Both DeepSeek reviews needed about 9.5
  minutes, so whether one fits under 600 s is a coin toss.
- Not tested: a lower reasoning effort (`claude --effort low|medium`) or a
  prompt that asks it to batch commands.

## Head-to-head

| Case | Quick review, gpt-6.1-sol | Quick review, DeepSeek | Hospital |
|---|---|---|---|
| #16911 | CHANGES: refusal gap, with a reproducing test (0.15) | no verdict (0.09) | CHANGES: refusal gap, plus a wrong test in the plan and a corrected workup claim (1.28) |
| #17045 vs #17057 | #17057, Biome blocker (0.18) | #17057, schema precedent and error accounting (0.09) | #17057, with red/green proof and a 14-item discharge (3.86) |

- On both cases, the 0.15–0.18 gpt-6.1-sol review reached the hospital's
  verdict and its main finding.
- What the hospital added:
  - On #16911: findings about its own test plan. They matter only if the
    hospital goes on to test the PR.
  - On #17045: red/green evidence that the tests catch the bug. Neither quick
    review produced that. gpt-6.1-sol ran tests and Biome; DeepSeek ran the
    test files once per PR.
- DeepSeek was cheapest and gave the most reasoned #17045 recommendation. On
  #16911 it explored for 10 minutes and produced nothing. One success in two
  is not reliable enough to trust it alone.
- None of the three treated "Fixes #14994" as a problem, even though part of
  that issue stays open after the PR. The workup mentioned it only as
  advisory.

## Cost

| Item | Pollen |
|---|---:|
| Quick reviews (4) | 0.50 |
| #16911 hospital | 1.28 |
| #17045 hospital | 3.86 |
| Setup: the harness's smoke test and the model probes | 0.20 |
| Box time (one hour paid ahead, then extended twice) | ~0.29 |
| **Total** | **~6.1** |

- The model costs come from the server's key balances: Claude 7 → 1.78, box
  key 2.5 → 1.87. They match the driver's ledger: Claude 5.22, Codex 0.63.
- With gpt-6.1-sol as reviewer, Codex cost 0.63 for the whole run. Run 4's
  Codex cost was 2.32.

## Operator notes

- The account's paid balance was 74.7 before the run. That is lower than run
  4's ~88 because other keys on the account also spend from it.
- The box's sandbox key can no longer create keys, so `polli harness
  claude-code` can't mint one there. The operator created
  `polli-harness-claude-code` from the account login with a budget and seeded
  it into the settings file. The harness then reused it, and its smoke test
  cost 0.13.
- The new template has no Codex. The operator installed `@openai/codex@0.162.1`.
- The ssh link to the box dropped once, during a quick review. The driver
  survived under `nohup`, and the rest of the run went through a queue
  script on the box.
  - That queue waited about 28 minutes for nothing. Its
    `pgrep -f "[h]ospital.py quick-review"` matched the launching ssh shell,
    whose command line still held the script text.
  - It cost box time only.
- Claude Code warns that `deepseek/…` and `openai/…` aren't in its model
  catalog, and assumes a 200k context for them. No stage came near that.

## Lessons

- A single gpt-6.1-sol review at about 0.15 Pollen matched the hospital's
  verdict on both cases. The hospital's extra value is test evidence and
  checking its own plan. It costs 8–20 times as much.
- DeepSeek v4.1-flash is cheap but unreliable at the 600 s limit. It might do
  better with a shorter prompt or a longer limit, but this run doesn't show
  that.
- Changes to tooling on base (here, the Biome upgrade) can turn a PR the
  hospital already discharged into a CI failure. A re-check before merge
  should rerun the formatter.
- The `unshare -rn` wrapper, which the roles came up with themselves, is a
  better offline guard than replay-only mode. It could go into PROTOCOL.md.
