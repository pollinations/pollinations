# Try Cockroach Labs' "hospital" approach on Pollinations: dry run in a polli sandbox

From Thomas (2026-10-11): "try to implement this approach: https://www.cockroachlabs.com/blog/experiment-running-hospital-code/ maybe with claude code to start. or do they provide some kind of harness? I'd like to test it on the pollinations code base on open issues, PRs etc." He chose a **dry run**: nothing is posted to GitHub. This copy is adapted to the E2B sandbox you are running in.

## What we know
- Their harness, Sinai (`cockroachlabs/sinai`), is private. The post describes it but links no code, so we build a small version ourselves. Fetch and read the post first (`curl -sL <url>`).
- Keep the parts that make it about quality over throughput:
  - roles as Markdown skill files: triage, fellow (plan, then implement), review attending (a separate instance that looks for faults and starts by disabling the change to check the new tests fail), discharge (audits the record, doesn't re-review);
  - a chart per case with sentinel-tagged notes;
  - no code before an approved plan;
  - never weaken tests;
  - escalate with a handoff instead of flailing;
  - a precedent log checked before escalating;
  - a rework circuit breaker;
  - splitting anything over about 1,000 lines into smaller cases.
- Their lessons: too much bureaucracy for trivial cases (fast-path them), runaway rework (cap it), bloated skill files (keep them short).

## Build
- Put the harness in `~/pollinations-hospital/` (git init, no remote). Nothing goes into the pollinations repo.
- Keep it minimal: one role file per role, a chart template, a precedent log, and the smallest driver script that runs one stage at a time.
- Roles run on Claude Code headless through Pollinations, on `anthropic/claude-opus-5.5`:
  `claude -p --settings ~/.pollinations/claude-code.json --model anthropic/claude-opus-5.5 "<prompt>"` (add `--dangerously-skip-permissions` for stages that edit or run tests; this VM is the sandbox).
- The review attending runs on a different model, so the reviewer isn't the same mind: `codex exec` (this Codex setup, `openai/gpt-6-astra`).
- Reuse what the repo already has instead of rewriting it: root `AGENTS.md`, `.claude/skills/` (review, model-management, quest-solution-review, enter-services), and `.agents/skills/ponytail`.

## Cases
- The repo is cloned read-only at `~/pollinations` (no push credentials). Use one local branch per case, `hospital/<number>`, started from `origin/main`. No worktrees, no second clone.
- Pick 3–5 open issues or PRs from `pollinations/pollinations`, read only. `gh` is not logged in here; read with `curl -s https://api.github.com/repos/pollinations/pollinations/...` (unauthenticated, 60 requests an hour, so cache what you fetch) and fetch a PR with `git fetch origin pull/<n>/head:pr-<n>`.
  - a mix of a clear bug, a small feature, and an open PR to review;
  - skip POLLEN-QUEST issues that are meant for contributors;
  - skip anything that needs production, secrets or paid live API calls to verify.
  - This sandbox has no decrypted secrets, so enter.pollinations.ai tests (which need `npm run decrypt-vars`) cannot run here: skip cases whose verification needs them.
- Tests: the repo's own runners, replay only. For gen: `cd gen.pollinations.ai && TEST_VCR_MODE=replay-only npx vitest run <file>`. Root `npm ci` is already done. Run single test files, never a whole suite.

## Hard limits
- **Nothing goes to GitHub:** no comments, labels, PRs, pushes or reviews.
- No secrets beyond this sandbox's own polli login, no production, no deploys. Never print a key.
- **8 GB RAM, 4 vCPU, no swap** (`pollinations-large`). Run one agent at a time, never in parallel. One role plus one gen test file fits; a whole gen suite does not belong here (it was OOM-killed on a 2 GB box at 1.8 GB).
- **Cost.** All model use is billed in Pollen to Thomas's account. For each case, record its start and end time (UTC) in the chart. At the end, run `polli usage --history --json --limit 200` and sum the cost in that window. Split it by API key: the `polli-harness-claude-code` key is the Claude roles; the `polli-sandbox-il8713rah47igszlv5yzt` key (this sandbox's login, moved from the 2 GB box it started on) is you and the Codex reviewer.
- **Stopping rule:** stop after 5 cases. Stop a case and escalate it once it passes 3 Pollen. Stop the whole trial once it passes 15 Pollen, counting your own use. An outside watcher pauses this sandbox at 15 Pollen.

## When you finish
Write `~/pollinations-hospital/REPORT.md` with:
- what you built (files, and how to run a case);
- each case's chart, branch and outcome (discharged, escalated, or circuit-broken), judged by the post's test: would we be embarrassed to merge it?;
- the cost and time per case;
- what you'd change before trying it on GitHub.

Then create `~/pollinations-hospital/DONE` and stop.
