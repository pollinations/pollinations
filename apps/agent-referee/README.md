# Referee

A Pollinations **code agent** that judges whether a "done" claim holds up against its
evidence — a diff, tool output, or test results — using Jev (`POST /alpha/decisions`)
for the actual call.

Callable model (once registered): `<your-github-username>/referee`

## Input

The agent gateway always hands a code agent a Responses-shaped request:

```json
{
  "input": "the null pointer bug is fixed",
  "metadata": {
    "evidence": "diff adds a null check before user.name; npm test passes 42/42",
    "threshold": 0.6
  }
}
```

- `input` — the claim to check.
- `metadata.evidence` — the diff, tool output, or test results backing it. Optional; an
  empty string still gets a Jev verdict, just a low one.
- `metadata.threshold` — probability cutoff for PASS, `0`–`1`. Defaults to `0.6`.

## How a run decides

1. Both strings go to `jev` as `state.claim` / `state.evidence`, with two questions: a
   `noul` (yes/no probability that the claim is fully true) and a `score` (five-rung
   evidence quality).
2. `verdict = PASS` when `probability_true >= threshold`, else `FAIL`. That's the one
   real decision Jev makes each run — the rest is plain code around it.
3. A cheap text model (`openai-fast`) writes the one-sentence explanation. If that call
   fails, a templated sentence citing Jev's probability takes its place, so the verdict
   never depends on the explainer.

## Example runs

`agent.test.ts` mocks `/alpha/decisions` at three different probabilities to show the
same code taking different paths — no live account is available in this environment to
call the real Jev model, so these are worked examples, not a live transcript:

| Claim | Evidence | Jev `probability_true` | Verdict |
| --- | --- | --- | --- |
| "fixed the null pointer bug" | "diff adds a null check; npm test passes 42/42" | 0.92 | **PASS** |
| "fixed the bug" | "no tests were run" | 0.30 | **FAIL** |
| "it's done, trust me" | *(none given)* | 0.10 | **FAIL** |

Response shape for the first row:

```json
{
  "model": "referee",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [{ "type": "output_text", "text": "Jev put the claim's probability of being fully true at 0.92, which clears the threshold." }]
    }
  ],
  "verdict": {
    "result": "PASS",
    "probability_true": 0.92,
    "quality": { "score": 4, "legend": { "0": "no support", "4": "full support" } },
    "threshold": 0.6
  }
}
```

Every answer also carries `x-referee-verdict` and `x-referee-probability` headers.

## Setup

1. Fork [`pollinations-referee-agent`](https://github.com/davealan74/pollinations-referee-agent)
   (mirrors `agent.ts` in this folder) to your own account.
2. Create the code agent:
   ```bash
   npx @pollinations/cli agents create --config code-agent.json
   ```
   with `code-agent.json`:
   ```json
   { "type": "code_agent", "repository": "https://github.com/<you>/pollinations-referee-agent" }
   ```
3. Call it like any text model, with `model: "<your-github-username>/referee"`, on
   `/v1/chat/completions` or `/v1/responses`.

Run the tests: `node --experimental-strip-types --test apps/agent-referee/agent.test.ts`.
