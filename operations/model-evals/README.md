# Model Evals

Weekly correctness scoring for every text model on `gen.pollinations.ai`,
starting with LAION's "Alice in Wonderland" reasoning puzzle
(https://arxiv.org/abs/2406.02061).

Three question families, each with fresh randomized numbers per run so
cached or memorized answers don't score:

- `aiw` — the original sibling-counting puzzle.
- `aiw_plus` — the same puzzle wrapped in irrelevant relative counts, testing
  whether a model reasons about who's who or pattern-matches on sentence shape.
- `bowls` — a state-tracking/counting task with a distractor bowl.

Answers are graded by code, not by another LLM. A model that errors or times
out counts as a failed trial, not a skip. Each model's score reports a 95%
Wilson-interval margin of error. Community models named after an official
model (e.g. `community/Saauf/gpt-6-luna` vs `openai/gpt-6-luna`) are compared
against their namesake, and a gap larger than the combined margin of error is
flagged in the results JSON.

## Usage

```bash
export POLLINATIONS_TOKEN=sk_...   # a Pollinations API key with balance
node src/run-evals.js                              # score every text model
node src/run-evals.js --community                  # community models only
node src/run-evals.js --models=openai/gpt-5.4-nano,community/Saauf/gpt-6-luna
node src/run-evals.js --trials=1 --families=aiw     # cheaper smoke run
```

Results are written to `results/<run-id>.json`, `results/latest.json`, and
appended to `results/index.json`. The model-monitor "Evals" tab reads these
files straight from the repository, so no new database or service is needed.

## Weekly automation

`.github/workflows/model-evals-weekly.yml` runs this every Monday and opens
an auto-merging PR with the new results, the same pattern as
`apps-update-metrics.yml`. It needs a `POLLEN_EVALS_KEY` repository secret
(a Pollinations API key) before it can run — until a maintainer adds it, the
workflow is a no-op.

## Adding a second eval family

Add a `generate<Name>(rng)` function to `src/questions.js` that returns
`{ family, prompt, answer }`, register it in `GENERATORS`, and add its key to
`FAMILIES`. No changes are needed elsewhere — the runner, grading, margin of
error, and frontend are all family-agnostic.
