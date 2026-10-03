# Jev test triage — verdict, evidence, next command

A code agent that turns a failing test run into a verdict, Jev's probabilities and the one command to run next.

Source and live deployment: [kreggscode/jev-test-triage](https://github.com/kreggscode/jev-test-triage).
Callable model: `kreggscode/jev-test-triage`.
Addresses [quest #15723](https://github.com/pollinations/pollinations/issues/15723).

## Decisions

- `pollinations("/alpha/decisions")` asks Jev four questions about the report: `verdict` (real-bug, flake, environment, expectation), `reproduces`, `evidence` and `blocker`, a 0-3 score.
- Plain code maps the answers to one action — `fix`, `rerun`, `repair`, `update-test` or `collect-evidence` — and a `now` / `today` / `later` priority taken from `blocker`.
- Evidence below 0.5, or a flake Jev also says reproduces, falls back to `collect-evidence` rather than acting on a shaky answer.
- A text model writes the card. It opens with the Jev line verbatim and is told not to re-decide or to invent stack frames, file names or counts.

## Runs

Four different reports produce four different verdicts and four different actions:

| Report | Jev verdict | Action |
| --- | --- | --- |
| assertion mismatch, diff named in the report | `real-bug` 0.87 | `git diff -- <file>` |
| timeout, 1 of 50 runs, moves between shards | `flake` 1.00 | `git stash && … && git stash pop` |
| `Cannot find module 'zod'`, empty `node_modules` | `environment` 1.00 | `npm ci && npm test` |
| assertion still expects the pre-debit balance | `expectation` 0.99 | `sed -n '1,40p' <file>` |

## Try it

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"kreggscode/jev-test-triage","input":"FAIL test/wallet.test.ts > debits the wallet once per request\nAssertionError: expected 1 to be 0\nChanged in this branch: enter.pollinations.ai/src/wallet.ts (+12 -4)\nCommand: npx vitest run test/wallet.test.ts"}'
```

Jev is paid for each call from the caller's own Pollen.

## Tests and deployment

Run `node --test agent.test.ts` with a current Node.js release.
Tests cover the shape of the Jev request and the action chosen for each verdict, including the contradictory flake case.

This folder is the reviewed example. Copy changes into the standalone repository's root `agent.ts`, then sync the existing agent. Merging this copy does not update the deployed agent.
