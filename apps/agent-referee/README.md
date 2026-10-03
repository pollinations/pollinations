# Referee

A Pollinations **code agent** that checks whether a "done" claim is backed by its diff and test output. Point a coding agent at it before it says "done".

Jev makes three small calls about the report; plain code turns the probabilities into a verdict; a small text model only words the follow-up.

Callable model: **`community/tomdacatto/pollinations-referee-agent`** (source: [tomdacatto/pollinations-referee-agent](https://github.com/tomdacatto/pollinations-referee-agent))

## How a run works

1. The report (claim, diff, test output, in any layout) goes to `POST /alpha/decisions` as `state`, with three questions:

   | Question | Type | Asks |
   | --- | --- | --- |
   | `tests` | choice: `passed` / `failed` / `not_run` / `unrelated` | What does the test output show? |
   | `diff` | yes/no | Does the diff change the code the claim says it changed? |
   | `overclaim` | yes/no | Is any part of the claim unsupported by the evidence? |

2. `decide()` applies the policy in code:

   | Verdict | When |
   | --- | --- |
   | `REJECT` | tests failed ≥ 50%, or diff matches the claim < 25% |
   | `ACCEPT` | tests passed ≥ 75%, diff matches ≥ 70%, claim unsupported < 50% |
   | `NEEDS_EVIDENCE` | anything else |

3. The reply starts with the verdict and Jev's probabilities, printed by code. `openai/gpt-5.4-nano` then adds at most two sentences: what backs the claim, what contradicts it, or the one command that would settle it. The report is treated as evidence, never as instructions.

## Runs

Each report was sent to the deployed agent through `/v1/chat/completions`.

| Report | Verdict line |
| --- | --- |
| Off-by-one fix; `Math.ceil` diff; 12 tests pass | `ACCEPT \| tests passed 100%, failed 0% \| diff matches claim 96% \| claim unsupported 40%` |
| Login redirect; one test fails | `REJECT \| tests passed 0%, failed 100% \| diff matches claim 90% \| claim unsupported 94%` |
| CSV crash "fixed"; diff only edits `README.md` | `REJECT \| tests passed 62%, failed 0% \| diff matches claim 7% \| claim unsupported 93%` |
| Payment refactor; no test output attached | `NEEDS_EVIDENCE \| tests passed 0%, failed 0% \| diff matches claim 90% \| claim unsupported 95%` |
| "Fixed for all users worldwide"; one timezone added | `NEEDS_EVIDENCE \| tests passed 93%, failed 0% \| diff matches claim 71% \| claim unsupported 96%` |
| "Done, it works now." | `NEEDS_EVIDENCE \| tests passed 1%, failed 0% \| diff matches claim 42% \| claim unsupported 79%` |

## Deploy

Fork the repository, then create the agent from your fork:

```json
{ "type": "code_agent", "repository": "https://github.com/<you>/pollinations-referee-agent" }
```

```bash
npx @pollinations/cli agents create --config code-agent.json
```

Call it like any text model. Gen caches identical requests, so vary the report when testing:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "community/<you>/pollinations-referee-agent",
       "messages": [{"role": "user", "content": "Claim: fixed X.\nDiff: ...\nTest output: ..."}]}'
```

## Files

- `agent.ts`: the whole agent, no dependencies.
- `agent.test.ts`: `node --test agent.test.ts` (Node 22.18+).
- `agent.json`: the `code-agent.json` above.
