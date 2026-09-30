# idea-judge

A Pollinations code agent where **Jev (TypeSafe System One) makes the real
decision on every run**. Give it an idea; Jev scores demand, feasibility, and
novelty and picks the verdict - `kill`, `fix`, or `ship`. The agent never
overrides Jev's choice; code only validates, normalizes, and explains it.

Source repository: <https://github.com/afanasevmylife/pollinations-idea-judge-agent>
Callable model name: `afanasevmylife/pollinations-idea-judge-agent` (private)

## Usage

```bash
curl -X POST https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "afanasevmylife/pollinations-idea-judge-agent",
    "input": "A blockchain-based loyalty program for neighborhood bakeries",
    "metadata": {"context": "bootstrapped solo founder"}
  }'
```

The assistant message reads `KILL|FIX|SHIP - <reasons>`, and the response
carries a structured `verdict` object:

```json
{
  "verdict": {
    "result": "fix",
    "confidence": 0.55,
    "probabilities": { "kill": 0.29, "ship": 0.01, "fix": 0.7 },
    "dimensions": { "demand": 0.31, "feasibility": 0.47, "novelty": 0.47 },
    "composite": 0.42,
    "agreement_flag": false,
    "partial": false
  }
}
```

## How it works

- One `POST /alpha/decisions` call asks Jev four independent questions: three
  five-rung scores (demand, feasibility, novelty) and the verdict choice.
  Jev's probabilities come back verbatim; dimension scores are Jev's
  probability-weighted rung indices, normalized by `score / (rungs - 1)`.
- `composite` is the mean of the dimensions (display only); `agreement_flag`
  fires when composite and the verdict tier (kill 0 / fix 0.5 / ship 1)
  disagree by more than 0.5.
- A cheap text model (`openai-fast`) writes the two-sentence reason, seeing
  the same context and the dimension scores Jev produced. If it fails, a
  templated string citing Jev's probabilities takes its place - the verdict
  never depends on the text model.
- Failure policy (fail closed):
  1. transport error or non-OK `/alpha/decisions` -> `502`;
  2. malformed JSON or an invalid verdict (unknown choice, bad probabilities
     or confidence) -> `502`;
  3. valid verdict but an invalid dimension -> disclosed partial result: that
     dimension is `null`, `partial: true`, composite/agreement become `null`.

## Setup notes

1. Fork <https://github.com/afanasevmylife/pollinations-idea-judge-agent>
   (or copy `agent.ts` into any public repo, at its root).
2. Register it: `npx @pollinations/cli agents create --config code-agent.json`
   with `{ "type": "code_agent", "repository": "<your fork URL>" }`.
3. Call it like any text model; the repo name becomes the model ID as
   `<github-username>/<repo-name>`.

## Proof runs

Live runs against the registered agent (2026-09-30, via `/v1/responses`) -
different inputs, different Jev decisions, probabilities included:

| Idea | Verdict | Probabilities (kill/fix/ship) |
| --- | --- | --- |
| Social network for pets where dogs post selfies | FIX | 0.44 / 0.48 / 0.08 |
| AI agent reviewing PRs in GitHub Actions | FIX | 0.28 / 0.42 / 0.30 |
| Perpetual-motion machine energy subscriptions | KILL | 1.00 / 0.00 / 0.00 |
| Helicopter ride sharing for Lagos commuters | KILL | 0.54 / 0.45 / 0.01 |

## Tests

```bash
npx tsx --test agent.test.ts   # Node < 22.18
node --test agent.test.ts      # Node >= 22.18 (native type stripping)
```

Twenty tests mock both upstream calls (kill/fix/ship mapping, probability
passthrough, every failure-policy branch, truncation, malformed input) and
replay a Jev response captured verbatim from the live `/alpha/decisions`
endpoint.
