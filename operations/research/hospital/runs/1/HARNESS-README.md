# Pollinations hospital — local dry run
Read REPORT.md for the trial outcome and limitations. No remote is configured here.

Run from this directory:
```
python hospital.py status
python hospital.py admit NUMBER --kind bug  # or feature / pr
python hospital.py triage NUMBER
python hospital.py plan NUMBER
python hospital.py plan-review NUMBER
python hospital.py implement NUMBER
python hospital.py review NUMBER
python hospital.py discharge NUMBER
```
Each invocation runs just one role and reports the next stage. Admissions need an eligible cached record in cache/issues.json. Cache read-only GitHub API results first; do not overwrite prior evidence. PRs: `git -C ~/pollinations fetch origin pull/NUMBER/head:pr-NUMBER`, save `git diff origin/main...pr-NUMBER` to cache, reference it in the chart. No worktrees or clones. Existing branches and dirty trees prevent admission. Do not run models concurrently with this driver.

`python hospital.py close NUMBER --reason 'I-PASS details'` escalates an active case. Closed cases are deliberately not resumable by this driver; a maintainer must review the handoff and authorize a separately budgeted trial. This trial's baseline is fixed at 2026-10-11 17:56 UTC. Do not delete its ledger or reset it to evade limits. `DONE` is a completion marker for this trial, not permission to rerun cases.

Claude stages use the requested settings and anthropic/claude-opus-5.5; attending stages use codex exec with openai/gpt-6-astra. Role text lives in roles/, shared rules in PROTOCOL.md. Charts are append-only; state.json holds the next gate. Prompts and runner logs are retained. Costs are deduplicated by usage event ID and accumulated across snapshots. Ten-second monitoring terminates a running process group after a reported limit is reached; billing delay/in-flight calls can overshoot. This is a trusted-agent prototype, not an OS/network security boundary.

`python test_hospital.py` runs offline gate/accounting checks. Only targeted package test files are permitted in Pollinations. Harness files stay here; case code would stay on hospital/NUMBER in ~/pollinations.
