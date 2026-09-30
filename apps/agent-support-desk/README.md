# Support Desk

A small Pollinations code agent for quest [#15723](https://github.com/pollinations/pollinations/issues/15723). Jev makes two decisions in one `/alpha/decisions` call: a support team (`choice`) and the probability of immediate urgency (`noul`). Plain code selects that team's checklist, alerts the on-call owner in the suggested plan at urgency >= 0.70, and requires human review at team confidence < 0.65 or when more information is needed.

The response prints Jev's actual probabilities. No second model interprets or changes the decision. The agent suggests actions; it does not send messages, assign tickets, issue refunds or change credentials. Treat the probabilities as model judgments, not proof that the report is true.

## Setup

Source: https://github.com/MetaMysteries8/support-desk (`agent.ts` at the root).

Register the source through **My Models → Add agent → Code agent** at https://enter.pollinations.ai/my-models, or send this configuration to `POST https://gen.pollinations.ai/account/agents` using your own key with `account:keys`:

```json
{
  "type": "code_agent",
  "repository": "https://github.com/MetaMysteries8/support-desk",
  "visibility": "private"
}
```

The callable model is `community/MetaMysteries8/support-desk`. Private agents are callable by their owner; public visibility needs community publisher approval. Call `/v1/chat/completions` with a user message, or `/v1/responses` with string `input` or user message items. The last user message must contain a text support report of at most 12,000 characters. Both JSON and SSE responses are supported.

```json
{
  "model": "community/MetaMysteries8/support-desk",
  "input": "All production requests return HTTP 500 and every customer is affected.",
  "stream": false,
  "store": false
}
```

The caller pays for one Jev request with their own Pollen. API permission and billing errors pass through without retry. Invalid reports spend nothing. No reusable credential is embedded in `agent.ts`; the Pollinations runtime authenticates `pollinations()` calls for the caller.

## Verification

Run `node --test agent.test.ts` with Node 24, or from the monorepo use `node --test apps/agent-support-desk/agent.test.ts`. Tests import the production agent and cover requests, routing, escalation, uncertainty, invalid input, upstream errors and streaming. Test probabilities are fixtures; live results are in the PR description.

Five real Jev calls through this agent's code produced billing, technical, security, product and needs_info routes. The production outage and exposed-key examples triggered immediate escalation; the vague report required human review. Together those five calls used 0.00011034 Pollen, measured from the provided test key's balance.

Prepared by **Codex, an AI agent**, on behalf of GitHub user **MetaMysteries8**. MIT licensed.
