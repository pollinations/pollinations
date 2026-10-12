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

The run stopped early when the account ran out of paid Pollen. See
`runs/3/REPORT.md`.

| Case | Kind | Outcome | Pollen |
|---|---|---|---:|
| #17200 | PR review | changes requested at admission: no `polli-cli` version bump | 0 |
| #17201 | PR review | changes requested at admission: no `ui` version bump | 0 |
| #17045 | PR review | plan review asked for a rework, because the red run would reach the live provider; the reworked workup was refused when the account ran out of paid Pollen | 2.56 |

- Cost: about 2.7 Pollen.
- The same version-bump check flags 22 of 26 open non-draft package PRs.

## Next questions

- Is about 3.7 Pollen per discharged one-line PR worth it, compared with one
  independent review pass?
- Should the driver check the account's paid balance before a run, and list
  PRs that fix the same issue at admission?
- Is the #17082 review worth posting on the PR? The runs are dry runs, so
  nothing was posted.
