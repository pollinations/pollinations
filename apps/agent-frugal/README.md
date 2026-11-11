# Frugal — request-cost routing

A code agent that chooses a model using estimated request cost and current health, without an extra classifier call.

Source and live deployment: [fadyabohamza-netizen/frugal](https://github.com/fadyabohamza-netizen/frugal).
Callable model: `community/fadyabohamza-netizen/frugal`.
Addresses [quest #15017](https://github.com/pollinations/pollinations/issues/15017).

## Routing

- Classifies requests as FAST, BALANCED or DEEP using text, conversation length, images and tools.
- Fetches the live catalog and recent health. Missing health data increases the estimated cost slightly; a missing catalog fails explicitly.
- Filters for the Responses endpoint, image/tool support and available context. Excludes agents and unpriced entries.
- Estimates input tokens from text and instructions, with output estimates of 128/512/2048 tokens by tier. This is a ranking estimate, not a spending limit or an exact tokenizer.
- Ranks by estimated cost with a health penalty, then chooses within the tier's price band. An empty band widens only to eligible models; no unchecked fallback.
- Forwards the original Responses input, roles, tool calls and results unchanged. Provider errors remain provider errors instead of triggering lossy history flattening.

The gateway handles public Chat Completions/text-to-Responses conversion. This example does not implement another protocol translator.

Non-streaming JSON includes `frugal_trace`; SSE bytes pass through unchanged. Trace headers and logs are best-effort: gateway conversions may remove custom metadata.

## Try it

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"community/fadyabohamza-netizen/frugal","input":"What is 2+2?"}'
```

The author's September 20 demos routed arithmetic, a calculator task and a proof to three different models. Routes change with catalog and health; use fresh prompts when testing because identical requests can be cached.

## Tests and deployment

Run `node --test agent.test.ts` with a current Node.js release.
Tests cover classification, cost, health, capability filtering, empty pools, structured history and SSE forwarding.

This folder is the reviewed example. Copy changes into the standalone repository's root `agent.ts`, then sync the existing agent. Merging this copy does not update the author's deployed agent.
