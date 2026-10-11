# Run 2 (2026-10-11, 20:50–21:21 UTC)

Three cases. One discharged, one ended with changes requested, and one
escalated. This was the first case in either run to go through implement,
red/green review and discharge. Dry run: nothing was posted to GitHub.

## What changed from run 1

- Triage and planning were merged into one workup stage.
- No Codex orchestrator. The operator ran each stage over ssh from a Mac
  session.
- Cost was counted by key ID. Each key also had a Pollen budget on the
  server, which is the hard stop.
- Tests ran through `run-test`, which keeps raw logs. An implement or review
  approval without passing (and red) logs escalates.
- Admission lists open PRs that mention the case.
- The verdict is read from the last verdict line.
- Claude roles get only `Bash,Read,Edit,Write,Grep,Glob`.
- Before any paid call, `test_hospital.py` drove a stub case through every
  stage. It passed on the Mac and on the box.
- Two changes were made during the run, each in its own commit:
  - `VERDICT: CHANGES` for PR cases.
  - A per-stage scope instruction.
- Settings: `case_limit` 5, then 4; `trial_limit` 10; `max_cases` 2,
  then 3.

## Cases

| Case | Kind | Stages | Outcome | Pollen |
|---|---|---|---|---:|
| [#17082](cases/17082/CHART.md) | PR: `polli keys create --expires-in` validation | workup, plan review | changes requested | 1.80 |
| [#16959](cases/16959/CHART.md) | bug: MCP `generateVideo` rejects video models | workup (killed at 600 s) | escalated | 3.72 |
| [#16717](cases/16717/CHART.md) | PR: MCP `generateText` keeps `logprobs` | all five | discharged | 3.69 |

**#17082: changes requested.**

- The workup found two problems:
  - The diff adds back the 365-day expiry cap that #15564 removed. Its new
    test rejects 366 days, which the server and web UI accept.
  - It doesn't bump the version that `AGENTS.md:176` requires for
    `polli-cli` changes.
- Codex plan review found that the workup and the PR body both misdiagnose
  the bug. `CreateKeySchema` marks `expiresIn` optional but not nullable,
  so the `null` the CLI sends is rejected with a 400. It does not create a
  key that never expires. The operator checked this against the schema.
- The hospital may not rewrite a contributor's diff, so the operator closed
  the case as changes requested. That gap led to `VERDICT: CHANGES`.
- The first plan-review attempt failed before any model call: the ssh
  launcher didn't export `POLLINATIONS_API_KEY` for Codex. The operator
  reopened the case with an OPERATOR note.
- Would we be embarrassed to merge? Yes, as written.

**#16959: escalated by the stage time limit.**

- The workup traced gen's model listing and key-category filtering in 24 tool
  calls.
- It was killed at 600 s before printing a note, so all its findings were
  lost: `claude -p` prints only at the end.
- The bug probably needs live key or account data to verify. The workup
  should have escalated early.
- This led to the scope instruction: about 15 tool calls, and escalate when
  live data is needed.

**#16717: discharged.**

- Workup and plan review approved applying the diff exactly. Plan review
  noted that an upstream `logprobs: null` now passes through.
- The fellow and the reviewer each produced a red run (exit 1, failing at the
  new assertion because the value was `undefined`) and a green run (exit 0).
  See `tests/implement-*.log` and `tests/review-*.log`.
- Discharge checked each item against those logs and the diff.
- Would we be embarrassed to merge? No: one pass-through line and a
  regression test, which matches the MCP package's rule of not transforming
  responses. GitHub CI still has to run.
- Stage costs: workup 1.26, plan review 0.65, implement 0.39, review 0.76,
  discharge 0.64.

## Cost

| Key | Run 2 | Run 1 |
|---|---:|---:|
| Claude roles (`polli-harness-claude-code`) | 7.18 | 4.00 |
| Codex (the sandbox's login key) | 2.13 | 6.82 (including the orchestrator) |
| Box time (a resume lease and 1 h paid in advance) | ~0.10 | ~0.04 |
| **Total** | **~9.41** | **10.86** |

- The model figures come from the server's key balances. The driver's ledger
  showed 9.21; the rest was billed after the stages ended.
- The key budgets started at 5 each. After case B the Claude key had 0.10
  left. Both were reset to what remained of the run (2.4 and 2.2) before
  case C. The Claude key ended with 0.12 left. No request was refused.
- Gap: the sandbox key has account `keys` permission, so code on the box
  could raise its own budget.

## Lessons

- Independent plan review caught a false diagnosis again (#17082), as in
  run 1's #17084.
- Without the orchestrator, Codex spend fell from 6.82 to 2.13.
- Raw test logs made discharge an audit of evidence instead of claims.
- A stage killed at its time limit loses everything. The driver should keep
  partial output, for example with `--output-format stream-json`, or ask for
  a wrap-up note before killing.
- A workup on a one-line PR still cost 1.26. Claude Code's context dominates.
- Most open contributor `polli-cli` PRs skip the version bump `AGENTS.md`
  requires, so they stop at CHANGES. A free static check could say that
  before any model runs.
- Models echo the sentinel tag inside their notes, so charts show it twice.
