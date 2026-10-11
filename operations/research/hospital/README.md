# Hospital trial

Research notes, not production code. We are trying Cockroach Labs'
["hospital" approach](https://www.cockroachlabs.com/blog/experiment-running-hospital-code/)
on open Pollinations issues and PRs. Their harness (Sinai) is private, so this
is a small local version: role files, a chart per case, and a driver that
runs one stage at a time. It is a dry run: nothing is posted to GitHub.

## Layout

- `hospital.py`: the driver. `python hospital.py admit N --kind bug|feature|pr`,
  then one stage per call. `test_hospital.py` holds the offline checks.
- `roles/`: triage, fellow (plan, then implement), review-attending (finds
  faults and proves red/green), discharge (audits the record only).
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

## Next questions

- Does merging triage and plan into one workup stage bring a small case under
  budget without losing the independent plan review?
- Can a per-key Pollen budget replace the driver's polling as the hard stop?
- Does a case get through implement, red/green review and discharge with raw
  test logs as evidence?
- Would a maintainer merge what comes out, or is a hospital review mainly
  useful as a plan check on contributor PRs?
