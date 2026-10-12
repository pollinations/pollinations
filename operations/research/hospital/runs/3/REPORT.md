# Run 3 (2026-10-12, 20:55–21:05 UTC)

Stopped early. Two PR cases closed for free at admission. The first paid case
went through workup and plan review, got a rework request, and then the
account ran out of paid Pollen during the rework. Dry run: nothing was posted
to GitHub.

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
  - `case_limit` 4, raised to 6 after the first rework request, so the
    rework loop could run end to end for the first time.

## Cases

| Case | Kind | Stages | Outcome | Pollen |
|---|---|---|---|---:|
| [#17200](cases/17200/CHART.md) | PR: `polli keys create --expires-in` validation | admission | changes requested (static check) | 0 |
| [#17201](cases/17201/CHART.md) | PR: ui touch-screen key buttons | admission | changes requested (static check) | 0 |
| [#17045](cases/17045/CHART.md) | PR: Lightning Image Turbo dimensions | workup, plan review, workup (refused) | escalated | 2.56 |

**#17200 and #17201: no version bump.** Both change shipped package source
without a version bump. #17200 is also the second open PR for the
`--expires-in` bug, after #17082 (run 2).

**#17045: escalated when the account ran out of Pollen.**

- **Workup** approved applying the diff as is.
  - It confirmed the bug: the adapter never sends dimensions upstream.
  - It checked the edge cases: dimensions omitted, edit requests, one side
    given, and the OpenAI `size` field.
  - It missed #17057, an open PR that fixes the same issue (#17044).
    Admission lists only PRs that mention the case's own number.
- **Plan review** (Codex) asked for a rework:
  - The PR's new test spies on `fetch` without mocking it.
  - The gen test setup forwards requests outside its Tinybird endpoints to
    the network.
  - So the planned red run, with the guard removed, would reach the live
    provider.
  - It found no blocker in the production change.
- **Reworked workup:** the gateway refused it partway through with "doesn't
  have enough credits… needs paid Pollen".
  - The account's paid balance had run out: 0.08 Pollen paid and 0.66 Quest
    Pollen left, and Opus needs paid Pollen.
  - The trial keys still had budget: Claude 5.27, Codex 2.16.
  - The driver found no verdict and escalated. That is fail closed: nothing
    ran unchecked.
- Would we be embarrassed to merge? Not decided. The source change looks
  right. If the guard ever regresses, though, the test reaches the network
  instead of failing cleanly. A maintainer also has to choose between #17045
  and #17057.

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
| Claude roles (`polli-harness-claude-code`) | 1.73 |
| Codex (the sandbox's login key) | 0.84 |
| Box time (resume, a paid hour in advance, short record copy) | ~0.1 |
| **Total** | **~2.7** |

The model figures come from the server's key balances.

## Lessons

- Key budgets cap spending but don't guarantee funds. Before a run, check
  that the account's paid balance covers the run budget. Other keys on the
  account spent about 3.6 Pollen in the same 16 hours.
- Admission should also list open PRs that fix the same issue as a PR case.
  Here, #17057 was missed, as #17086 was in run 1.
- Independent plan review caught a real problem for the third run in a row.
  This time it was the hospital's own unsafe verification plan, not the
  diagnosis.
- The new checks and settings worked as intended:
  - Partial-note capture didn't change normal notes. No paid stage hit the
    time limit, so it is covered only by the offline test.
  - The version-bump check is the cheapest finding in three runs.
