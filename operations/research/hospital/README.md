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
  `anthropic/claude-opus-5.5`. Review runs `codex exec` on `openai/gpt-6-astra`,
  so the reviewer is a different model.
- Codex 0.162 replays reasoning state that gen's `/v1/responses` rejects. The
  trial used a local proxy that strips it. That proxy is a stopgap until #17123.
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

## Next questions

- Is 3.7 to 8 Pollen per discharged small PR worth it, compared with one
  independent review pass? One rework doubles the cost.
- Is the #17082 review worth posting on the PR? The runs are dry runs, so
  nothing was posted.
