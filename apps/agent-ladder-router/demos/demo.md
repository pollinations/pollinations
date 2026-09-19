# Ladder Router — live demos (3 differently-routed requests)

Agent: `community/ammarelshaf3y/ladder-router`
(agent ID `1221416a-ff5c-4038-b52c-c9f1427371b5`, code agent, private).
Live catalog on 2026-09-17 priced `community/AkshayCoder48/free-voice`
cheapest in every tier, so all three demos below picked it — with a
different recorded reason each time. As catalog prices shift, the
routes shift automatically; nothing is hardcoded.

## 1. Short text → cheapest healthy text model (Responses API)

Prompt: `say hi in exactly five words`

Trace: `[ladder-router: community/AkshayCoder48/free-voice ok |
cheapest healthy text model]`

Reply: Hello there, nice to meet you!

## 2. Long document (~22k chars) → cheapest healthy large-context model

Prompt: `Summarize the following engineering log in two sentences...`
(900-line sensor log via stdin, fresh conversation)

Trace: `[ladder-router: community/AkshayCoder48/free-voice ok |
cheapest healthy large-context model]`

Reply: two-sentence summary of the log (pressure 101kPa, 22C).

## 3. Chat Completions endpoint → trace injected into choices

POST `/v1/chat/completions`, message: `explain in one sentence why
the sky is blue`.

Trace (prepended to `choices[0].message.content`):
`[ladder-router: community/AkshayCoder48/free-voice ok |
cheapest healthy text model]`

Reply: Rayleigh-scattering explanation in one sentence.

## Escalation (code-verified, not triggered live)

The catalog was healthy during all tests, so no 429/5xx/timeout
occurred live. The escalation path is covered by static tests in
`test.mjs` (6/6 green): ladder of up to 3, retry-next on
429/5xx/abort, trace lists every attempt (`A failed, escalated ->
B ok`).

## Endpoint-awareness (live-catalog verified, 2026-09-18)

`community/MarcosFRG/deepseek-v4-flash-0731` was ~10x cheaper than the
winner, yet never picked on `/v1/responses`: its catalog entry lists
only `/v1/chat/completions, /text, /text/{prompt}`. The ladder's
endpoint filter excluded it correctly there. Health-first ordering
kept the healthy pick on top per endpoint.

## Notes

- Streaming requests forward to the first ladder pick unchanged
  (trace injection applies to non-streaming JSON on both endpoints).
- Attached-image payloads (`input_image`) could not be demoed live:
  the gateway stalled fetching the image URL in this environment
  (reproduced with a direct base-model call, so unrelated to the
  router). The vision tier (cheapest healthy `input_modalities:
  image` model) is covered by static tests.
