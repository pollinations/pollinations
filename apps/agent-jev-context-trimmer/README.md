# Jev context trimmer

A small Pollinations code agent that scores archived tool outputs with Jev before calling GPT-5.4 Nano. It drops irrelevant outputs and forwards retained content strings exactly, including whitespace and Unicode. The response includes the answer, relevance probabilities, retained outputs and removed character count.

This is a bounded one-step loop: one batched Jev request and one answer request per valid run. It does not execute tools, summarize discarded context or modify retained text. Each Jev `noul` probability of at least 0.5 keeps its output. If every output is dropped, the answer model receives an empty archive and must report insufficient evidence.

## Deploy and call

1. Fork the [public source repository](https://github.com/ale-rls/jev-context-trimmer), keeping `agent.ts` at its root.
2. In [My Models](https://enter.pollinations.ai/my-models), choose Code agent and your public repository URL. Private visibility is sufficient for owner-only testing. Public listing requires community publisher access.
3. After deployment, call the repository-derived model name, such as `ale-rls/jev-context-trimmer`, through `/v1/responses` or Chat Completions. Use non-streaming requests. Place the task JSON in the final user message; previous conversation messages are not forwarded.

```json
{
  "model": "ale-rls/jev-context-trimmer",
  "input": "{\"task\":\"Which test failed?\",\"outputs\":[{\"id\":\"tests\",\"content\":\"FAIL billing: expected 12, got 11\\n\"},{\"id\":\"weather\",\"content\":\"Sunny, 22°C\"}]}",
  "stream": false,
  "store": false
}
```

Responses output text is JSON with `answer`, `decisions`, `retained_outputs`, `dropped_ids`, `context_characters`, `jev` and `answer_model`. Chat Completions exposes the same JSON in assistant content. `context_characters` measures JavaScript string code units; it is not a tokenizer or monetary savings claim. Jev sees the full bounded archive, while only retained outputs reach Nano. A small archive can cost more to score than it saves in answer-model input.

The caller needs generation access to `jev` and `openai/gpt-5.4-nano`, plus the deployed agent. All calls use the caller's Pollen and permissions through the platform helper; no API key appears in source. Dashboard deployment avoids adding account permissions to a testing key. CLI deployment uses `code-agent.json` and requires the account permission documented by the [agent guide](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md).

## Checks and live evidence

Requires Node.js 22 with TypeScript stripping support; development dependencies are used only for formatting and type checking, never by deployment.

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run format
# After deployment, with a limited temporary key already in the environment:
node live.mjs
```

`live.mjs` makes three owner-authenticated calls over the same two archived outputs: a billing question, a weather question and an unrelated question. It saves exact inputs, decisions, reported usage and answers under ignored `live-results/`. Assertions check task-dependent selection and exact retained content. No retry is performed. Inspect saved results before publishing evidence; an expected selection is not a fabricated result or a guarantee of model behavior. A 0.01–0.05 Pollen cap is a proposed test budget, not measured spend.

Limits: nonempty task up to 2,000 characters; 1–8 outputs with unique 1–64 character IDs (`A–Z`, `a–z`, digits, `_`, `-`); each content 1–12,000 characters, total 48,000. Invalid input returns 400 before calling a model. Missing or invalid Jev probabilities and usage stop the run before the answer call. Provider errors, incomplete answer generation and invalid answer usage return 502; calls are not retried.

Tool archives are untrusted data. Both prompts instruct the models to ignore embedded instructions. This is a relevance filter, not a security boundary; probabilistic mistakes can drop relevant evidence. Use original outputs when the task needs completeness or verification. No content is persisted by the agent itself.

## Source and quest

Written for [quest #15723](https://github.com/pollinations/pollinations/issues/15723). Runtime and decision contracts were checked against the current official agent guide and `shared/schemas/decisions.ts` on 2026-09-30. Existing Jev PRs were research references; this implementation does not copy their code. MIT license, copyright ale-rls.

Deployment, live runs and quest submission are separate steps. This repository's existence does not prove a callable deployment, acceptance or reward credit. See `EVIDENCE.md` for the current verification state.
