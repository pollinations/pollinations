# Model evals

Scores every text model on `gen.pollinations.ai` against the same test, and
publishes a ranking anyone can read. The first eval is LAION's **Alice in
Wonderland** puzzle.

```sh
POLLINATIONS_API_KEY=sk_... npm run eval -- --limit 6
```

## Why

Nothing checked what a model can actually *do*. The registration test only
checks the reply format, and the monitor trusted the name an endpoint reports —
so a community model called `gpt-6-luna` was never verified. This runs one
simple, code-graded test against every text model, community models included,
and shows a score with its margin of error.

## Usage

```
POLLINATIONS_API_KEY=sk_... node src/run.js [options]

  --limit <n>          score at most n models
  --models <a,b,c>     score only these model names
  --community-only     score only community models
  --official-only      score only official models
  --repeats <n>        questions per family per model (default 1)
  --families <a,b>     subset of: aiw, aiwPlus, bowls
  --seed <n>           fixed run seed (default: fresh random)
  --concurrency <n>    parallel requests (default 4)
  --json               print the full report as JSON
  --output <path>      also write the report JSON here
```

Human output is a ranked table (accuracy, margin of error, correct/failed, cost);
`--json` prints the same report as JSON. Piping the per-input lines of
`embeddings` is not a thing here — this is text.

## The Alice in Wonderland puzzle

Ported from [LAION-AI/AIW](https://github.com/LAION-AI/AIW) (Apache-2.0). The
questions come in three families:

- **aiw** — "Alice has B brothers and S sisters. How many sisters does Alice's
  brother have?" The trap: the answer is `S + 1`, because Alice is one of the
  sisters. A model that answers `S` fell for it.
- **aiw+** — a longer cousins puzzle, answer computed from the family tree.
- **bowls** — a counting control question.

**Every run draws fresh random numbers** (the run seed is printed, so a run is
reproducible from its report). A fixed question would be memorised or cached;
fresh numbers cannot be. A model that errors or times out counts as **failed**,
not skipped.

Answers are graded by code only: the number after `### Answer:` is compared to
the expected value. No LLM grading.

## Scoring

- Accuracy = correct / total, with a 95% **Wilson** interval, so the margin of
  error is honest even for a handful of samples.
- A model that shares a base name with an official model (a community knock-off
  like `gpt-6-luna` next to `openai/gpt-6`) is listed next to it, and a gap
  **bigger than the combined margin of error** is highlighted.

## Cost

A full run costs well under 20 Pollen and prints what it cost (per-token prices
come from `/text/models`; a model with no pricing shows `n/a`). A community
model that returns `429` for a per-user limit is retried slowly — that is *our*
rate limit, not a model failure — instead of being counted as failed.

## Weekly run

`.github/workflows/evals-weekly.yml` runs the eval every Monday and commits the
result to `operations/model-monitor/public/evals/` (`latest.json` plus an
appended `history.json`), which the **Evals** tab reads. It needs a
`POLLINATIONS_API_KEY` repository secret; until a maintainer adds it, the
workflow is a no-op. It can also be run on demand from the Actions tab.

## Adding another eval

Add a family to `src/puzzle.js` (its questions and its `expected` value) and it
is picked up automatically — no other wiring. A whole new eval with its own
grading can live beside it; only the questions and the grading are eval-specific.

## Files

- `src/puzzle.js` — the AIW questions and code grading
- `src/rng.js` — seeded RNG and per-run seeds
- `src/client.js` — the `gen.pollinations.ai` text client (retries, timeouts)
- `src/score.js` — accuracy, Wilson margin, community-vs-official gaps
- `src/run.js` — the CLI
- `src/evals.test.js` — unit tests (no live calls)
