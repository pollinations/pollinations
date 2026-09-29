# Model evals

Scores every text model on `gen.pollinations.ai` against a small, code-graded
quiz, so the leaderboard says what a model can actually do instead of trusting
the name it reports.

The first eval is LAION's "Alice in Wonderland" puzzle ([repository](https://github.com/LAION-AI/AIW),
[paper](https://arxiv.org/abs/2406.02061)): the `aiw`, `aiwplus` and `bowls`
question families. Every run generates fresh numbers, so a model cannot pass by
replaying a memorised answer.

## Run it

```bash
POLLINATIONS_API_KEY=... node operations/model-evals/run.mts
POLLINATIONS_API_KEY=... node operations/model-evals/run.mts --filter community
POLLINATIONS_API_KEY=... node operations/model-evals/run.mts --models openai/gpt-6-luna,community/Saauf/gpt-6-luna
POLLINATIONS_API_KEY=... node operations/model-evals/run.mts --dry-run
POLLINATIONS_API_KEY=... node operations/model-evals/run.mts --balance
POLLINATIONS_API_KEY=... node operations/model-evals/run.mts --json --out operations/model-evals/output
```

The key is read from `POLLINATIONS_API_KEY` only, never from a flag, so it
cannot end up in shell history or in a workflow log.

| Flag | Meaning |
| --- | --- |
| `--eval <id>` | Which eval to run (default `aiw`) |
| `--filter <all\|official\|community>` | Which half of the catalog to score |
| `--models <a,b>` | Score only these models (full name, alias or short name) |
| `--questions <n>` | Questions per family (default 3) |
| `--seed <n>` | Run seed; the same seed regenerates the same quiz |
| `--concurrency <n>` | Models scored in parallel (default 6) |
| `--timeout-ms <n>` | Per-request timeout (default 90000) |
| `--max-attempts <n>` | Attempts per request, retrying 429 and 5xx (default 3) |
| `--max-tokens <n>` | Output cap for models that accept one (default 400) |
| `--pollen-budget <n>` | Spend ceiling for the whole run, 0 disables it (default 20) |
| `--max-cost-per-model <n>` | Spend ceiling per model (default 1) |
| `--out <dir>` | Write `latest.json`, `history.json` and `leaderboard.txt` |
| `--json` | Print the report JSON instead of the leaderboard |
| `--dry-run` | List the models and the estimated cost, send nothing |
| `--balance` | Print the account balance and exit |

## What the output means

- **Score** is `correct / asked` with a Wilson 95% interval, so a model that
  answered 3 of 3 is reported as uncertain rather than perfect.
- **Errors and timeouts count as failures.** A request that never produced a
  gradable answer is a wrong answer, not a skipped question.
- **A 429 is retried, not failed.** That is our per-user limit, not the model's
  behaviour.
- **Questions are cached by request body upstream**, so every question carries a
  seed derived from the run seed, the model and the question id; repeats inside
  one run get a new seed too. Two runs of the same eval therefore never send the
  same request body.
- **Community models named after an official model are paired with it.** The
  pair is flagged when the gap between them is bigger than the combined margin
  of error, which is the only signal here that survives the noise.
- **Cost** is computed from the catalog prices and the reported token usage.
  A model whose price is unknown is listed as cost unknown instead of being
  silently charged as free.

## Adding a second eval

Only questions and grading are needed: create `evals/<id>.mts` exporting an
`EvalDefinition` and add it to `EVALS` in `evals/index.mts`. The runner, the
scoring, the margins, the cost guard and the report are shared.
`evals/aiw.mts` is the reference implementation.

## Weekly run

`.github/workflows/model-evals.yml` runs the full eval every Monday and commits
`latest.json`, `history.json` and `leaderboard.txt` to the `news` branch, which
is where the model-monitor "Evals" tab reads them from. The workflow skips
itself with a notice until maintainers add `PLN_GITHUB_EVALS_KEY`.

`node operations/model-evals/publish.mts --source <dir>` does the commit through
the Contents API with the workflow's app token; it needs `GITHUB_TOKEN` and
`GITHUB_REPOSITORY`.

## Tests

```bash
node --test operations/model-evals/*.test.mts
```

The suite covers the question generators, the grader, the Wilson interval, the
catalog selection and pairing, the client retry rules, the runner's budget and
cost caps, the report and the leaderboard rendering, and both CLIs. The fake
server in `test-helpers.mts` answers the puzzles correctly, so the grading path
is exercised end to end.
