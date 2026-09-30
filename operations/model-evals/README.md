# Model Evals

A weekly AIW ("Alice in Wonderland") eval that scores **every text model**
on `gen.pollinations.ai` — community models included — against three
reasoning-trap question families, with **answers computed by code, never by
an LLM**, and every score reported with its margin of error.

The question families come from the LAION AIW benchmark
([LAION-AI/AIW](https://github.com/LAION-AI/AIW), Apache-2.0;
[paper](https://arxiv.org/abs/2406.02061)):

1. **AIW** — the classic sisters/brothers counting trap ("Alice has 4
   sisters and 1 brother. How many sisters does Alice's brother have?").
2. **AIW+** — the harder cousin-counting puzzle (nephews/nieces and
   nieces/nephews of aunts and uncles, several relation hops).
3. **Bowls** — colored-bowl counting on a table ("...a big blue bowl, in
   addition to this bowl there are 2 red bowls and 3 blue bowls. How many
   blue bowls are on the table besides the red bowls?").

Fresh numbers are randomized on every run, so a memorised or cached answer
never scores. Every request also carries a per-run-derived **seed** so the
platform response cache cannot serve a stale completion.

## Usage

```bash
# Score every text model (a Pollinations API key is required)
POLLINATIONS_API_KEY=sk-... node operations/model-evals/cli.mjs \
  --out results/latest.json \
  --history results/history.json

# Only community models, or an explicit model list
node operations/model-evals/cli.mjs --only community
node operations/model-evals/cli.mjs --models "openai/gpt-5.4-nano,community/Saauf/gpt-6-luna"

# Preview the model selection and generated questions without any requests
node operations/model-evals/cli.mjs --list --evals aiw --questions 3
```

Get an API key at https://enter.pollinations.ai/keys. Options: run
`node operations/model-evals/cli.mjs --help`.

## Semantics

- **Errors and timeouts count as failures** —
  a model is never skipped for misbehaving. Unanswered questions lower the
  score.
- **429 rate limits are our limit, not the model's**: the runner backs off
  and retries slowly (15s, 30s, 60s, 120s). Exhausting that account quota
  marks the run incomplete, not the model bad. Incomplete runs are retained
  as diagnostics but are not published as the weekly leaderboard.
- **Margin of error**: scores include the actual 95% Wilson interval.
  The displayed ± margin is the larger distance from the observed score to
  either Wilson bound, conservatively containing the interval even at 0%
  and 100%. Gaps are highlighted only beyond the combined margins.
- **Pollen cost**: catalog pricing times provider-reported usage, including
  cached prompt, cache writes, and reasoning tokens. This is not a wallet
  reconciliation. Missing usage is unknown, never silently free, and is
  reported separately with a conservative reserved estimate.
- **Budget**: requests reserve estimated worst-case prompt/output cost
  synchronously before dispatch, so workers cannot spend the same remaining
  budget. Default budget is 19 Pollen (always below 20), with `max_tokens`
  limited to 2048. A request that cannot fit is not sent; the run is
  incomplete and does not replace the weekly leaderboard. Reservations
  assume providers honor the token cap and catalog pricing. They are not a
  provider-enforced spending limit; providers can violate those assumptions.
  A full-catalog cost still needs to be demonstrated by a real run, not
  inferred from unit tests.
- **Community models shadowing official ones**: models are matched by name
  (exact base-name match first, then shared name series like `gpt-6`), and
  the leaderboard shows each community model directly beneath the official
  model it is named after, with the score gap highlighted only when it
  exceeds the combined margins of error.

## Outputs

- `--out latest.json` — the full run: per-model score, margin of error,
  per-family breakdown, cost, latency, plus generated prompts, each question's raw response, usage, parsed answer,
  and expected answer for reproducible review.
- `--history history.json` — one summary entry per run, capped at the most
  recent 26 runs.
- The [model-monitor](../model-monitor/) Evals tab fetches these files from
  `public/evals/` and renders the leaderboard and past runs.

## Weekly workflow

[`.github/workflows/evals-weekly-model-evals.yml`](../../.github/workflows/evals-weekly-model-evals.yml)
runs the CLI every Monday at 05:00 UTC once the `PLN_GITHUB_EVALS_KEY`
secret is set, commits only complete `latest.json`/`history.json` into
`operations/model-monitor/public/evals/` on an auto-merge branch, and
opens a tracking issue on failure.

## Layout

| File | Purpose |
| --- | --- |
| `questions.mjs` | The three question families with randomized numbers |
| `grading.mjs` | Answer extraction (LAION `answer:` convention) and comparison |
| `catalog.mjs` | `/text/models` access, subset selection, Pollen pricing |
| `stats.mjs` | Wilson margins, official/community pairing, leaderboard order |
| `runner.mjs` | Concurrency, seeds, 429 retry, timeouts, cost cap |
| `cli.mjs` | The one command. Prints the leaderboard and the cost |

Tests: `node --test "operations/model-evals/*.test.mjs"` (also part of the
PR check workflow). The question generators are verified against
independent prompt-parsing solvers in the tests, so the ground truth is
cross-checked, not self-asserted.

## Exit codes and adding an eval

Exit 0 means a complete run, 1 an execution/configuration error, 2 exhausted
account rate limits (or missing key), and 3 budget exhaustion. The workflow
uploads diagnostics on failure without publishing incomplete standings.

To add an eval, add its generator to the `FAMILIES` registry in `questions.mjs`.
It returns `{ prompt, answer, meta }`; the runner and leaderboard need no changes.
For non-numeric answers, add the corresponding deterministic grader to
`grading.mjs` and route by family. No LLM judge is used.

Real-run evidence (at least five models including a community model) must be
attached to the PR before this quest can be considered complete. No fabricated
scores or cost estimates are presented as an executed run.
