# Run #17183 — other-author PR, pricing data (no prior knowledge)

- PR: https://github.com/pollinations/pollinations/pull/17183
  "fix: correct GLM Flash cached input pricing"
- Author: ElliotEtag. State: open. No relationship to the operator; the
  diff was first read AFTER preselection.md was written.
- Pinned head: `993390d1b34888f00f4c13a5ae943a54b952574c`
  (branch `codex/glm-cache-pricing` in pollinations/pollinations — never
  touched; no-fix result, so no fork branch was created).
- Base: `a2cdb2ee3c9650597fe35e9a22577c101325aba3`. Head re-verified
  after the run via pulls API + local `git rev-parse pr-17183` (match).

## Model review

- Call: `agent.json` systemPrompt + read-only review task, model
  `openai/gpt-6.1-sol`, served model `gpt-6.1-sol`.
- Usage: prompt 1086, completion 460 (104 reasoning). Cost 0.006772 pollen
  estimated (see costs.md). No retries.
- Verdict (verbatim in run-17183.json): **NO-FIX** — changes internally
  consistent, snapshot matches, untouched sibling is a distinct model.
  Explicitly notes provider rates were not independently verified.

## Human verification (independent of the model verdict)

The model left provider rates unverified, so the operator checked the one
rate card reachable without credentials — OpenRouter's public model list
(`https://openrouter.ai/api/v1/models`, fetched 2026-10-13):

| field | OpenRouter `z-ai/glm-5.3-flashx` | PR value (before 5.5% fee) |
|---|---|---|
| prompt | 0.00000037 ($0.37/M) | perMillion(0.37) — match |
| completion | 0.00000125 ($1.25/M) | perMillion(1.25) — match |
| input_cache_read | 0.00000009 ($0.09/M) | perMillion(0.09) — match |

With the stated 5.5% fee these reproduce the snapshot exactly
(0.00000039035 / 0.00000131875 / 0.00000009495). The Fireworks flash entry
is internally consistent (0.15/0.03/0.5 with matching snapshot
0.00000015/0.00000003/0.0000005); the Fireworks serverless rate card is
not publicly fetchable, recorded as a limit, not a finding. Other
`0.000000079125` snapshot occurrences belong to unrelated models
(gemini-3.7-flash, mistral-small-3.2, nex-n2.5-pro) — confirmed by context,
not stale copies.

Head CI at the pinned SHA: 16/16 check-runs success (incl. "Test
enter.pollinations.ai", which runs the effective-prices snapshot test —
the snapshot is in sync with the registry).

## Result: NO-FIX

The PR is correct as far as independently checkable. Scope: both model
entries, the snapshot hunks, stale-reference scan, OpenRouter cross-check
of the flashx route. Limits: Fireworks card unverifiable from here;
sibling `z-ai/glm-5.3` (2026-08-29 rate) flagged as an open question for
the PR author, not a finding. No commit, no push. Human intervention:
context assembled by the operator; OpenRouter cross-check by the
operator; judgment (concur no-fix) by the operator with the model
verdict on record.
