# Jev context trimmer

Scores archived tool outputs with Jev, keeps outputs with relevance probability >= 0.5, and passes their exact content to GPT-5.4 Nano to answer the task. Each run makes one batched Jev decision request followed by one answer request. The response includes the answer, decisions, retained outputs and removed character count.

## Deploy and call

1. Fork [the public source repository](https://github.com/ale-rls/jev-context-trimmer), keeping `agent.ts` at its root.
2. In [My Models](https://enter.pollinations.ai/my-models), choose Code agent and enter your public repository URL. Private visibility permits owner-only calls; public listing requires publisher access.
3. Call your deployed model through `POST /v1/responses` with a non-streaming request. The existing deployment is `community/ale-rls/jev-context-trimmer` (private, owner-callable). The caller needs generation access to the agent, Jev and Nano; requests spend the caller's Pollen.

```json
{
  "model": "community/ale-rls/jev-context-trimmer",
  "input": "{\"task\":\"Which test failed?\",\"outputs\":[{\"id\":\"tests\",\"content\":\"FAIL billing: expected 12, got 11\\n\"},{\"id\":\"weather\",\"content\":\"Sunny, 22°C\"}]}",
  "stream": false,
  "store": false
}
```

The final user input contains the task JSON. Retained strings are preserved, including whitespace and Unicode. If no output is retained, Nano receives an empty archive. Invalid inputs or incomplete Jev decisions stop the run. Inputs are bounded to a 2,000-character task, 1–8 outputs, 12,000 characters per output and 48,000 total.

## Verified runs

Three deployed-agent calls on 2026-09-30 used the same synthetic billing/weather archive:

| Task | Billing relevance | Weather relevance | Retained | Removed UTF-16 code units |
| --- | ---: | ---: | --- | ---: |
| Billing test question | 0.98 | 0.02 | billing_test | 119 / 247 |
| Paris weather question | 0.01 | 0.96 | paris_forecast | 128 / 247 |
| Unrelated novel question | 0.01 | 0.01 | none | 247 / 247 |

Observed cost: approximately **0.000333 Quest Pollen**. [Full evidence, inputs and tooling](https://github.com/ale-rls/jev-context-trimmer/blob/main/EVIDENCE.md) are in the public source repository.

Run the eight local tests with Node.js 24:

```sh
node --test agent.test.mjs
```
