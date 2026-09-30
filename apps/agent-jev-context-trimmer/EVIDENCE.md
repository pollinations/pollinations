# Verification evidence

Status: root agent deployed the source through the signed-in dashboard; generation testing is pending.

- Live evidence: pending a user-created limited generation key; no live-generation call yet.
- Registered model ID displayed by the dashboard: `community/ale-rls/jev-context-trimmer`.
- Deployed source commit displayed by the dashboard: `c4a0d64`; subsequent commits changed documentation and the live harness, not `agent.ts`.
- Visibility: private, owner-callable; public source and agent visibility are separate.
- Exact retained-content comparison: covered by local tests; must also pass live assertions.
- Task reversal: `live.mjs` submits the same archived outputs with billing, weather and unrelated tasks.
- API spend: none incurred during implementation. Record actual usage and wallet charges after live runs.
- Quest acceptance and reward credit: not confirmed.

Add genuine live results before submitting the quest PR. Preserve request IDs, deployed commit, probabilities, kept/dropped IDs and reported usage. Do not include credentials or private account details.
