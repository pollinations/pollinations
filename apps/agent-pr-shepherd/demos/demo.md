# PR Shepherd — live demos (3 real PRs, honest results)

Agent: `community/ammarelshaf3y/pr-shepherd`
(agent ID `26b6fc09-0991-4114-ace4-30b81d36f189`, prompt agent,
`openai/gpt-6.1-sol` + Computer MCP, private).
Costs below from `polli usage --history` (model + computer calls).

## Run 1 — pollinations/pollinations#17251 (dave's pr-fixer)

- Fetched title/body/diff (3 files, 7,853 bytes) via `.diff`.
- Clone blocked: `refusing to create symlink with unsafe target
  '../../.claude/skills/abuse-detection'` → `fatal: 'origin' does
  not appear to be a git repository`.
- Honest stop: no fix invented, token untouched, warned to revoke it.
- Cost: ~$0.015 (gpt-6.1-sol calls + computer calls).

## Run 2 — pollinations/pollinations#17386 (pr-doctor)

- Same systematic blocker on the same monorepo symlink. Confirms
  run 1 was not a fluke: NO agent can full-clone this repo in the
  sandbox today.
- Honest stop, no push, no hallucination.
- Cost: ~$0.006.

## Run 3 — ammarelshaf3y/pr-shepherd#1 (deliberate off-by-one)

- Small repo, no symlinks: `.diff` fetched (280 bytes), clone OK.
- Second blocker found: `fatal: couldn't find remote ref pull/1/head`
  — just-git does not serve GitHub's pull refs. Retry with direct
  branch checkout also refused same-repo push per guardrails (the
  push target was the PR's own repo, not a separate fork).
- Token never used, never echoed. Cost: ~$0.008.

## What this proves (and what it costs)

- Review intake works: `.diff` read, findings scoped, 250-word report.
- Guardrails hold under pressure: no invented fixes, no false push
  claims across 4 live runs, token never written anywhere.
- Two novel sandbox findings for the write-up: (1) the monorepo's
  unsafe symlink blocks every full clone; (2) pull/N/head refs are
  unresolvable in just-git, so PR-head checkout needs another path.
- A full review run costs $0.005–0.02 in model + tool calls.
- Push to a caller fork with a caller token is implemented in the
  prompt but unproven live: every push attempt was correctly refused
  (wrong target or missing creds). That path needs a fork PR demo
  with the reviewer's own token.
