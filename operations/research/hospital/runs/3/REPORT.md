# Run 3 (2026-10-12, 20:55–22:10 UTC)

Three PR cases:
- Two closed for free at admission.
- One was discharged after a full rework loop: the first case in any run to
  go from a rework request to discharge.

The run paused for about 50 minutes when the account ran out of paid Pollen.
Dry run: nothing was posted to GitHub.

## What changed from run 2

- Claude roles log `stream-json`. A stage stopped at its time limit keeps a
  partial note of its steps; Codex keeps its log tail.
- The box key's account permissions were narrowed to `profile` and `usage`.
  Its attempt to change its own budget now gets a 403, and `polli usage`
  still works. The Claude key had no account permissions to begin with.
- At admission, a PR case that changes what `sdk`, `ui` or `polli-cli` ships
  without bumping the package version closes as changes requested, before
  any model call.
- Settings:
  - Key budgets: Claude 7, Codex 3.
  - `trial_limit` 10, `max_cases` 5.
  - `case_limit`: 4 at the start. The operator raised it to 6 after the first
    rework request, then to 7 and to 8, so that #17045 could finish.

## Cases

| Case | Kind | Stages | Outcome | Pollen |
|---|---|---|---|---:|
| [#17200](cases/17200/CHART.md) | PR: `polli keys create --expires-in` validation | admission | changes requested (static check) | 0 |
| [#17201](cases/17201/CHART.md) | PR: ui touch-screen key buttons | admission | changes requested (static check) | 0 |
| [#17045](cases/17045/CHART.md) | PR: Lightning Image Turbo dimensions | workup, plan review (rework), workup, plan review, implement, review, discharge | discharged | 8.00 |

**#17200 and #17201: no version bump.** Both change shipped package source
without a version bump. #17200 is also the second open PR for the
`--expires-in` bug, after #17082 (run 2).

**#17045: discharged after one rework.**

- **Workup** approved applying the diff as is.
  - It confirmed the bug: the adapter never sends dimensions upstream.
  - It checked the edge cases: dimensions omitted, edit requests, one side
    given, and the OpenAI `size` field.
- **Plan review** (Codex) asked for a rework:
  - The PR's new test spies on `fetch` without mocking it.
  - The gen test setup forwards requests outside its Tinybird endpoints to
    the network.
  - So the planned red run, with the guard removed, would reach the live
    provider.
- **First reworked workup:** refused by the gateway partway through.
  - The account's paid balance had run out: 0.08 Pollen paid and 0.66 Quest
    Pollen left, and Opus needs paid Pollen.
  - The trial keys still had budget (Claude 5.27, Codex 2.16), and the
    driver escalated on the missing verdict.
  - Thomas had 100 paid Pollen credited, and the operator reopened the case
    with an OPERATOR note.
- **Second reworked workup:**
  - Added a temporary offline stub, `mockImplementation(async () =>
    successResponse())`, only on the new test's spy.
  - Ran the red and green runs inside a `trap` that restores the files.
  - Finished with the PR's unchanged test. Codex approved the plan.
- **Implement and review** each produced their own logs:
  - Red, stubbed and without the guard: 3 failed and 13 passed, because "promise
    resolved instead of rejecting". No network errors.
  - Green, stubbed: 16/16.
  - Green on the exact PR files: 16/16.
  - Biome passed on both files.
- **Discharge** checked 15 items against the logs and the diff. The tree is
  exactly the PR diff.
- Would we be embarrassed to merge? No. It is a guard of a few lines plus
  regression tests, and #17044 asks for exactly this behaviour change.
- Two notes for the maintainer that no stage escalated:
  - The test spy should return `successResponse()`, so that a regression
    fails offline.
  - #17057 is an open PR that fixes the same issue. None of the stages
    mentioned it, because admission lists only PRs that mention the case's
    own number.
- Stage costs:

  | Stage | Pollen |
  |---|---:|
  | workup | 1.30 |
  | plan review (rework) | 0.84 |
  | first rework workup (refused) | ~0.43 |
  | second rework workup | ~1.43 |
  | plan review | 0.83 |
  | implement | 0.84 |
  | review | 1.21 |
  | discharge | 1.04 |

  These include billing that arrived after each stage ended.

## Version-bump check across open PRs

Run offline on 2026-10-12 over every open PR that touches `sdk`, `ui` or
`polli-cli`:

- 26 non-draft PRs; 22 of them change shipped files without a version bump:
  #17201, #17200, #17087, #17083, #17081, #17064, #17063, #17059, #17056,
  #17054, #17040, #16846, #16845, #16841, #16310, #16286, #16273, #15786,
  #15382, #15251, #14053, #13464.
- The check costs nothing and needs no model.

## Cost

| Key | Run 3 |
|---|---:|
| Claude roles (`polli-harness-claude-code`) | 5.03 |
| Codex (the sandbox's login key) | 2.97 |
| Box time (two resumes, each with an hour paid in advance) | ~0.2 |
| **Total** | **~8.2** |

The model figures come from the server's key balances. The Codex key ended
with 0.03 left, so no third paid case was possible.

## Lessons

- Key budgets cap spending but don't guarantee funds. Before a run, check
  that the account's paid balance covers the run budget.
- One rework loop roughly doubled the case's cost: 8.0, against 3.7 for run
  2's discharge.
  - Every Claude stage costs at least about 0.8. The rework added two
    planning stages and a refused stage.
  - Review was more thorough and more expensive than in run 2, because it
    added a stubbed and an exact-files green run.
- Independent plan review caught a real problem for the third run in a row.
  This time it was the hospital's own unsafe verification plan, not the
  diagnosis.
- Admission should also list open PRs that fix the same issue as a PR case.
  It missed #17057 here and #17086 in run 1.
- The version-bump check is the cheapest finding in three runs.
- Partial-note capture didn't change normal notes. No paid stage hit the time
  limit, so it is covered only by the offline test.
