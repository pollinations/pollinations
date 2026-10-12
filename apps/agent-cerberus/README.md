# Cerberus — Jev security review triage

Source and deployed agent: https://github.com/murderszn/cerberus (root `agent.ts`).
Callable model: `community/murderszn/cerberus`. Currently private to the author;
public publishing requires Pollinations publisher approval.
Addresses quest #15723.

Jev makes one bounded `choice` decision per run through
`pollinations("/alpha/decisions", ...)`. Code selects the corresponding
contain/investigate/maintain playbook, then `openai/gpt-5.4-nano` explains the
selected action and its probabilities. The agent forwards the downstream
Responses JSON or SSE, including its real usage. Both calls use the caller's
Pollen and permissions. No external credentials, package installation, file
execution, or repository mutations are needed.

Input is a security finding or scan summary. Reports are untrusted data;
probabilities are advisory and a passing static scan is not a security guarantee.
The serialized report is capped at 18,000 characters. Do not submit credentials
or private source. The agent needs access to Jev and the explanation model.
Invalid or failed decisions stop the run before an explanation is requested.

## Try it

Register the public source repository in My Models → Create agent → Code agent.
The owner can use the private deployment immediately. Public use needs publisher
approval. Callers need generation access; no account-administration scopes.

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"community/murderszn/cerberus","input":"A static scanner flagged a query builder, but no reproduction exists. What should we do?","stream":false}'
```

## Recorded live runs — October 1, 2026

All three requests to the deployed private agent completed successfully with
provider usage. These are probabilities recorded in its explanation, not mock
results or promises about future requests.

| Input summary | Code-selected action | Jev probabilities |
| --- | --- | --- |
| Unauthenticated public database; customer record access reproduced | contain | contain 1; investigate 0; maintain 0 |
| Static query-builder warning; no request path or runtime reproduction | investigate | investigate 1; contain 0; maintain 0 |
| All applicable scan checks and runtime access-control tests passed | maintain | maintain 0.74; investigate 0.26; contain 0 |

## Verification

`node --test apps/agent-cerberus/agent.test.mjs` (Node 23+).
Four tests import the real agent and stub only its outbound requests: playbook
selection for each decision, streaming forwarding, and invalid-answer rejection.

This folder is the reviewable example. Deploy changes from the standalone
repository's root `agent.ts`; merging this copy does not update that deployment.
