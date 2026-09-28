# Model Evals

Weekly, reproducible reasoning checks for every Pollinations text model. The runner calls the live `gen.pollinations.ai` catalog and Chat Completions API, grades answers in code, records failures instead of skipping them, and writes versioned JSON consumed by the Model Monitor **Evals** tab.

## Run

```bash
# all text models
POLLINATIONS_TOKEN=sk_... node operations/model-evals/src/run-evals.js

# a subset
POLLINATIONS_TOKEN=sk_... node operations/model-evals/src/run-evals.js \
  --models=openai/gpt-5.4-nano,openai/gpt-6-luna,community/Saauf/gpt-6-luna

# community models only
POLLINATIONS_TOKEN=sk_... node operations/model-evals/src/run-evals.js --community
```

Useful controls: `--trials=3`, `--families=aiw,aiw_plus,bowls`, `--concurrency=3`, `--seed=12345`, `--budget-pollen=19.5`.

Every request includes a per-trial `seed` so Pollinations' response cache cannot turn repeated evals into cached answers. HTTP 429s and transient 5xx responses are retried with backoff; exhausted retries and timeouts count as failed trials. A successful response must include both completion content and provider usage, so account/balance messages cannot accidentally be scored as model answers.

## Results

The runner writes:

- `results/<runId>.json` - immutable run details, including prompts' expected answers, model outputs, failures, usage-derived cost and latency.
- `results/latest.json` - current leaderboard.
- `results/index.json` - up to 104 run summaries for the history picker.

Scores use a 95% Wilson margin of error. Community models are matched to official models by normalized model-name leaf; when both are present, the result records the score gap and combined uncertainty so the UI can highlight gaps larger than the margin of error.

## Adding an eval

Add one family definition in `src/questions.js`: a randomized question generator plus its deterministic grader. The runner, statistics, history, weekly workflow and UI are family-agnostic.

## Tests

```bash
node --test operations/model-evals/src/*.test.js
```

The tests cover question generation/grading, Wilson margins, model filtering, community/official matching, 429 retry behavior, per-request cache-busting seeds, balance-error handling, and preservation of run history.
