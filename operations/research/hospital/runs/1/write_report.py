"""Reconcile the last usage snapshot and render this completed trial's report."""
import datetime as dt
import json
import hospital as h
rows=h.usage(); end=h.now(); start='2026-10-11 17:56:00'
keys=['polli-harness-claude-code','polli-sandbox-il8713rah47igszlv5yzt']
total=h.costs(rows,start,end)
lines=[]
for n in [17085,17087,17084]:
    folder=h.ROOT/'cases'/str(n); s=json.loads((folder/'state.json').read_text())
    s['cost_by_key']=h.costs(rows,s['start'],s['end']); h.save(folder/'state.json',s)
    duration=dt.datetime.fromisoformat(s['end'])-dt.datetime.fromisoformat(s['start'])
    c=s['cost_by_key']; other=sum(v for k,v in c.items() if k not in keys)
    h.note(folder,'COST_RECONCILIATION',f"Final observed snapshot {end} UTC. Window {s['start']} through {s['end']} inclusive. Duration {duration}. Claude {c.get(keys[0],0):.6f}; sandbox orchestrator/reviewer {c.get(keys[1],0):.6f}; other usage {other:.6f}; total {sum(c.values()):.6f} Pollen. Late billing can revise these figures.")
    lines.append(f"| [#{n}](cases/{n}/CHART.md) | `hospital/{n}` | {s['start'][11:]}–{s['end'][11:]} | {duration} | {c.get(keys[0],0):.6f} | {c.get(keys[1],0):.6f} | {other:.6f} | {sum(c.values()):.6f} | Escalated |")
report=f'''# Pollinations hospital dry-run report

Completed local trial: three open cases sampled, zero discharged, zero circuit-broken, three escalated. No Pollinations source changes, GitHub writes, deployments, live verification calls, or secrets operations. None of the cases has evidence sufficient for merge approval. The experiment demonstrates useful plan-review findings and conservative stops, not successful treatment throughput or completed code-review quality.

## What was built

A separate local Git repository with no remote at `~/pollinations-hospital`:

- `hospital.py`: 139-line standard-library driver, one stage per invocation, exclusive local lock, branch checks, approved-plan ordering, two-rework breaker, five-admission cap, per-case and total usage checks, process-group termination, charts and local commit support after implementation/review.
- Four short role files: `roles/triage.md`, `roles/fellow.md`, `roles/review-attending.md`, `roles/discharge.md`.
- `PROTOCOL.md`, `chart-template.md`, `PRECEDENTS.md`: shared rules, sentinel notes and human-sourced precedents. No agent-created Chief decisions.
- `cases/`: cached source, UTC admission/end, branch/base, plan, reviewer notes, prompts and logs. `cache/`: GitHub read-only responses and PR diff/ref evidence. `usage-ledger.json` deduplicates billing events; `usage-latest.json` retains the final 200-row response.
- `README.md` run instructions; `test_hospital.py` offline accounting/gate checks; `write_report.py` reconciliation/report renderer.
- `hospital-post.html` and `.txt`: fetched and read the [Cockroach Labs article](https://www.cockroachlabs.com/blog/experiment-running-hospital-code/). Sinai is private according to the brief; the post describes it but offers no public harness source. This implementation is a small local adaptation, not Sinai itself.

Run `python hospital.py admit NUMBER --kind bug` (or feature/pr), then separately `triage`, `plan`, `plan-review`, `implement`, `review`, `discharge`, each followed by NUMBER. Eligible source must be cached first. The next-stage gate rejects out-of-order execution. See README for PR caching and manual escalation. Completed cases cannot be reopened through this driver.

Claude role command uses `claude -p --settings ~/.pollinations/claude-code.json --model anthropic/claude-opus-5.5 --dangerously-skip-permissions`. Attending uses `codex exec --model openai/gpt-6-astra` in a separate process. Roles ran serially; the orchestrator did only supervision/record work while a role was active. No agent spawning. Existing root AGENTS.md, Ponytail and `.claude/commands/review.md` were reused; the brief's review skill is actually a command file. Model-management, quest-solution-review and enter-services were out of scope; no providers, quests or Enter services were changed.

## Cases and evidence

All dates below are 2026-10-11 UTC. All branches started at `origin/main` commit `953c897635352bdcdc5811c4cb0824566e74f321` in the sole existing checkout, without worktrees. They still point to that base; the final checked-out branch is `hospital/17084`, clean. Branches may be identical because no case passed through implementation.

| Case/chart | Branch | UTC window | Duration | Claude Pollen | Sandbox Pollen | Other Pollen | Total | Outcome |
|---|---|---|---|---:|---:|---:|---:|---|
'''+'\n'.join(lines)+f'''

**Bug [#17085](https://github.com/pollinations/pollinations/issues/17085): audio help uses an unsupported default-model voice.** Triage confirmed `callum` belongs to ElevenLabs while the no-model example defaults to OpenAI TTS. Fellow proposed `nova`, a rendered-help regression, and required CLI version/lockfile changes. The fellow reported a baseline of 11 passing tests in `packages/polli-cli/src/commands/gen/audio.test.ts`, but did not retain raw test output; treat that as a role claim, not independently audited evidence. Codex plan review was terminated after the cost threshold. No approved plan, implementation, or red/green proof. Would we be embarrassed to merge? Yes, if presented as verified: the plan is plausible but the gates are incomplete. Handoff is in the chart. Cached PR #17086 already addressed this report; triage incorrectly said no duplicate was cached. Admission should have linked it.

**Small feature [#17087](https://github.com/pollinations/pollinations/pull/17087): SDK video/audio/embedding model discovery.** Selected as the feature case from an open PR. Fellow cached its diff; independent plan reviewer verified endpoint contracts, reuse of `getJson`, helper exports, and preservation of existing assertions. The reviewer corrected the restoration instructions and noted a loopback-server fixture means the full file is not entirely fetch-mocked. Missing SDK version/lockfile/changelog changes remain a merge blocker. Plan approved only for local evaluation. The next-stage budget check stopped implementation. No tests or changes were made by the reviewer. Would we be embarrassed to merge? Yes, as an approved hospital output: no regression execution or discharge audit exists, and release requirements remain open.

**Open PR review [#17084](https://github.com/pollinations/pollinations/pull/17084): SDK pipe delimiter for reference image arrays.** Fetched `pull/17084/head:pr-17084`, cached diff and refs, and confirmed it applies to the base. Codex plan review rejected the proposed procedure: the saved copy was the unmodified base, so its planned “restore and expect green” step would remove the fix. It also identified a changed existing expectation requiring separate treatment under the local protocol, lack of a comma-in-URL regression, and missing release metadata. It recommended filtering the test file to relevant offline cases. No patch was applied and no regression test run. Would we be embarrassed to merge? Yes, if relying on this record as approval. The serialization fix is supported by static inspection, but its evaluation plan was unsound. The existing equality assertion changing from comma to pipe is not inherently a weakened test; part of this escalation came from our overly rigid process, not a demonstrated defect in that assertion.

## Cost, time and stopping

Trial accounting window: **{start} through {end} UTC**. This conservatively starts at the brief's setup time before the first tool call, includes the user-reported proxy interruption and resume, setup, all three cases, and reporting observed so far. The end-of-trial `polli usage --history --json --limit 200` was executed, and overlapping samples were deduplicated by `cursor_event_id` to avoid truncation/double counting.

- Claude key `polli-harness-claude-code`: **{total.get(keys[0],0):.6f} Pollen**.
- Sandbox key `polli-sandbox-il8713rah47igszlv5yzt`: **{total.get(keys[1],0):.6f} Pollen**, includes this orchestrator plus Codex reviewers; the key does not distinguish those roles.
- Other usage, chiefly sandbox leases: **{sum(v for k,v in total.items() if k not in keys):.6f} Pollen**.
- All observed account usage in window: **{sum(total.values()):.6f} Pollen** (conservative whole-trial gate; includes non-model usage).

Case totals use inclusive request timestamps in each chart's start/end window. Delayed records raised the first two totals after their stops. Driver checks before each stage and every ten seconds while running, sends TERM then KILL to the role process group, and starts no further stages for an over-budget case. It cannot cancel already-billed/in-flight requests or force immediate billing visibility. Thus 3 Pollen is a detected stop threshold, not a guaranteed spend ceiling. A final assistant response and later billing settlement may not appear in this snapshot; do not describe these costs as a final invoice.

Stopped after the requested minimum mix of three cases, below the five-case maximum and 15-Pollen whole-trial threshold. No fourth/fifth case was needed to repeat the same budget result. Two cost escalations plus one plan-review escalation closed the selected sample. The two-rework circuit breaker was not exercised by real cases.

## Verification and limitations

`python -m py_compile hospital.py` passed. `python test_hospital.py` passed assertions for inclusive cost windows/key grouping, rejecting implementation before a plan, refusing a new model stage after case budget exhaustion, and refusing admission at the trial ceiling. The existing runner actually executed Claude triage/planning and separate Codex plan review on three cases. Final repository checks found no Pollinations changes and no harness remote.

No implementation, reverse-change regression review, or discharge role ran successfully; those paths remain unproven end-to-end. No whole test suite, Gen test, Enter test, paid/live verification, deployment or external write was attempted. The local driver enforces stage order and detects some forbidden mutations afterward, but role prompts enforce most behavioral rules; this is not a security sandbox or robust tamper-proof workflow. Discharge correctness and the 1,000-line/rework paths need stronger tests before external use. Local cached records and runtime logs may contain source and billing metadata, so review artifacts before sharing them.

## Changes before trying this on GitHub

1. Make the trivial fast path genuinely cheaper: combine admission and workup into one concise Claude stage, hand off a bounded context/evidence bundle, and retain independent plan/code review. Six cold role processes are disproportionate under a 3-Pollen case budget. Do not change models or budgets without authorization.
2. Reserve budget for reviewer/discharge and reporting; use per-request token/spend limits plus a settlement lag buffer. A ten-second usage poll and a rolling history cannot guarantee a hard monetary ceiling, especially across interrupted/in-flight requests. Use server-enforced key ceilings if available under a separately approved credential workflow.
3. Require raw test logs as artifacts, structured verdict/evidence fields, approval bound to a commit/diff hash, and before/after checks including HEAD and untracked files. Parse a final exact verdict rather than searching arbitrary output text.
4. Fix the contradictory commit policy: the driver owns commits, while faulty-test correction requires a separately reviewed commit. Define a legal local split/review path instead of making a maintainer resolve a restriction invented by the harness. Distinguish strengthening/correcting a contract assertion from weakening it. Loopback fixtures are offline and should be expressly allowed; the third reviewer interpreted “avoid network tests” too broadly.
5. Link duplicate cached issue/PR records automatically, honor release metadata rules consistently, and define a real fast path without dropping gates. Keep precedents human-authored; record new process proposals here rather than silently creating rulings.
6. Before any GitHub pilot, exercise implementation → reversible red/green proof → discharge on a small offline fixture, test interruption recovery and exact restoration, and provide explicit external-write permissions. Human review remains necessary. This dry run grants no permission to publish, push, comment or merge.

Charts and local handoffs are the deliverable. No request for user input is pending; this trial ends with `DONE`.
'''
(h.ROOT/'REPORT.md').write_text(report)
print(f'Report written; observed trial total {sum(total.values()):.6f} Pollen at {end} UTC')
