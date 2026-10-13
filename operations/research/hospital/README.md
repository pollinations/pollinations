# Hospital trial

Research notes, not production code. We are trying Cockroach Labs'
["hospital" approach](https://www.cockroachlabs.com/blog/experiment-running-hospital-code/)
on open Pollinations issues and PRs. Their harness (Sinai) is private, so this
is a small local version: role files, a chart per case, and a driver that
runs one stage at a time. It is a dry run: nothing is posted to GitHub.

## Layout

- `hospital.py`: the driver. `python hospital.py admit N --kind bug|feature|pr`,
  then one stage per call: workup, plan-review, implement, review, discharge.
  Roles run tests through `hospital.py run-test -- <command>`, which keeps the
  raw output and exit code under the case's `tests/`.
- `run.json` (local, gitignored): `start`, `keys` (key ID → role label),
  `case_limit`, `trial_limit`, `max_cases`.
- `test_hospital.py`: offline checks, including a full case run with a stub
  model. Run it before any paid run.
- `roles/`: workup (admit and plan), fellow (implement), review-attending
  (finds faults and proves red/green), discharge (audits the record only).
- `PROTOCOL.md`: shared rules. `PRECEDENTS.md`: human decisions only.
  `chart-template.md`: the chart each case starts from.
- `BRIEF.md`: the original task as given to the orchestrator.
- `runs/<n>/`: each run's report, charts, state and prompts. Raw runner logs,
  cached GitHub data and usage ledgers stay out of the repo.

## Setup

- Polli sandbox on `pollinations-large` (4 vCPU / 8 GB), with a blobless clone
  at `~/pollinations` and `npm ci` done. One case branch `hospital/<n>` per case.
- Claude roles run `claude -p` through `~/.pollinations/claude-code.json` on
  `anthropic/claude-opus-5.5`. Review runs `codex exec` on `openai/gpt-6.1-sol`
  from run 5 (`openai/gpt-6-astra` before), so the reviewer is a different model.
- Runs 1–4 used a local proxy for Codex, which replayed reasoning state that gen's
  `/v1/responses` rejected. #17123 fixed that on production.
- `hospital.py quick-review N --model M [--rival R]`: one review pass by one
  model on a scratch branch, before admission and blind to the hospital. Run 5
  compares these cheap reviews with the full hospital.
- Codex isn't in the current `pollinations-large` template; install
  `@openai/codex` on the box. The box's sandbox key can't create keys, so
  create the Claude key from the account login and seed it into
  `~/.pollinations/claude-code.json` before running `polli harness claude-code on`.
- GitHub is read once and cached (unauthenticated API, `git fetch pull/<n>/head`).

## Run 1 (2026-10-11)

Three cases, all escalated, none discharged. See `runs/1/REPORT.md`.

| Case | Kind | Outcome | Pollen |
|---|---|---|---:|
| #17085 | bug | over the 3-Pollen case limit during plan review; triage missed duplicate PR #17086 | 3.21 |
| #17087 | feature (open PR) | plan approved, then over the case limit | 3.25 |
| #17084 | PR review | plan review rejected an unsound restore step | 2.16 |

- Cost: 10.66 Pollen in the report window. With calls that were billed later,
  10.82: Claude roles 4.00, sandbox key 6.82 (the orchestrator plus Codex).
- Plan review caught real faults. Implementation, red/green review and
  discharge never ran.
- Six cold role processes per case cost too much for a 3-Pollen case budget.
- `polli usage --key <name>` matches only the first key with that name. Many
  sandboxes create `polli-harness-claude-code`, so count costs by key ID.

## Run 2 (2026-10-11)

Iteration 2 harness, three cases: one discharged, one with changes requested,
one escalated. See `runs/2/REPORT.md`.

| Case | Kind | Outcome | Pollen |
|---|---|---|---:|
| #17082 | PR review | changes requested: adds back a removed 365-day cap; the PR and the workup misdiagnose the bug | 1.80 |
| #16959 | bug | workup killed at the 600 s stage limit, before printing its note | 3.72 |
| #16717 | PR review | discharged, with red/green run-test logs from both the fellow and the reviewer | 3.69 |

- Cost: about 9.41 Pollen. Claude roles 7.18, Codex 2.13, box time about 0.10.
- Server key budgets were the hard stop. No request was refused, but the Claude
  key ended with 0.12 left.

## Run 3 (2026-10-12)

Iteration 3 harness:
- stopped stages keep partial notes;
- the box key can't change key budgets;
- a free version-bump check runs at admission.

See `runs/3/REPORT.md`.

| Case | Kind | Outcome | Pollen |
|---|---|---|---:|
| #17200 | PR review | changes requested at admission: no `polli-cli` version bump | 0 |
| #17201 | PR review | changes requested at admission: no `ui` version bump | 0 |
| #17045 | PR review | discharged after one rework: plan review blocked a red run that would reach the live provider, and the rework stubbed it offline | 8.00 |

- Cost: about 8.2 Pollen. The account ran out of paid Pollen mid-run; Thomas
  had 100 credited, and the case was reopened.
- The same version-bump check flags 22 of 26 open non-draft package PRs.

## Run 4 (2026-10-12)

The iteration 3 harness on two fresh PRs. See `runs/4/REPORT.md`.

| Case | Kind | Outcome | Pollen |
|---|---|---|---:|
| #16920 | PR review | discharged in one pass: GPT Image region failover on 401/402/403, with matching red/green logs from the fellow and the reviewer | 5.06 |
| #16359 | PR review | changes requested at workup: #16213 deleted the file it edits, and base already has the fix | 1.02 |

- Cost: about 6.2 Pollen. Claude 3.76, Codex 2.32, box time about 0.1.
- The box was killed after the run. Its records are under `runs/4/`.

## Run 5 (2026-10-13)

A head-to-head with the iteration 4 harness. Each case first got blind quick
reviews from DeepSeek v4.1-flash and gpt-6.1-sol, then the full hospital,
with gpt-6.1-sol as reviewer. See `runs/5/REPORT.md`.

| Case | Quick review, gpt-6.1-sol | Quick review, DeepSeek | Hospital |
|---|---|---|---|
| #16911 | CHANGES: refusal-only streams are never cached (0.15) | no verdict, stopped at 600 s (0.09) | changes requested at plan review: the same gap, plus a test plan that couldn't catch it (1.28) |
| #17045 vs #17057 | #17057; #17045 fails Biome (0.18) | #17057 (0.09) | discharged with #17057, red/green proof (3.86) |

- Cost: about 6.1 Pollen. Quick reviews 0.50, hospital 5.14, setup and box
  time about 0.5.
- A 0.15 Pollen gpt-6.1-sol review reached the hospital's verdict on both
  cases. The hospital added test evidence and caught a flaw in its own plan.
- With gpt-6.1-sol as reviewer, Codex cost 0.63 for the whole run, against
  2.32 in run 4.

## Next questions

- One gpt-6.1-sol review matched the hospital on both run 5 cases for a tenth
  of the cost or less. Is the hospital's red/green evidence worth the
  difference, or should it only run on PRs a quick review approves?
- Is the #17082 review worth posting on the PR? The runs are dry runs, so
  nothing was posted.
