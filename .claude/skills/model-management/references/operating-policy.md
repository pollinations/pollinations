# Pollinations model operating policy

These are strategic defaults. The user's explicit, confirmed contract for a specific model overrides a default. Live provider economics, balances, quotas, and candidate priority remain in the ignored `temp` plans and must be rechecked.

## Route selection

- Prefer managed serverless inference.
- For equivalent routes, prefer **Azure**, then **Fireworks**, then **OpenRouter** because of Pollinations' credit position and effective economics.
- Treat **DeepInfra** as a parallel funded-balance lane. Use it when it is the best eligible route, but do not move a healthy Azure or Fireworks route there merely to consume balance.
- Before choosing a route, enumerate the exact model across the preferred providers, the current provider, and other already-integrated providers. Compare current posted price, credit eligibility, availability, quotas, capabilities, latency, and maturity.
- Do not route to a provider solely because an old model name matches. Verify the exact canonical checkpoint, capabilities, limits, latency, and pricing.
- Direct providers remain valid when the preferred platforms lack an equivalent route or the direct API has a material capability advantage.

## Access and economics

- `paidOnly: false` means Quest-Pollen-accessible. Do not move such a service from a funded/credit route to a route that creates cash spend merely because its posted unit price is lower.
- InferencePort migrations are eligible only for existing `paidOnly: true` services. A new InferencePort model must also be proposed as `paidOnly: true`.
- Confirm `paidOnly` and `priceMultiplier` for every model. Never infer either from the provider name.
- Provider cost, Pollinations multiplier, and billing mechanics are separate concepts. Do not use the multiplier to compensate for missing or inaccurate usage accounting.
- Quality and strategic novelty come before route convenience. A paid-only model may still be worth adding when it is exceptional.

## Fallbacks

- Default to **no Pollinations fallback** for new routes.
- Add or change a fallback only with explicit confirmation of the exact pair and proof of model identity, capabilities, parameters, permissions, billing, provider attribution, and economics.
- Use the shared generic fallback system when an already-approved production pair needs migration; do not build a model-specific retry layer.
- Provider-managed fallback is distinct from Pollinations fallback. Preserve the provider default unless its tradeoffs require a product decision, and disclose those tradeoffs before editing.
- Never add a more expensive fallback when users are billed from the cheaper primary quote unless the economics are explicitly accepted.

## GPUs and latency

- Pollinations-operated GPUs require a separately proven popularity, utilization, reliability, and margin case. Being open-weight is not enough.
- Prefer provider APIs for niche or uncertain-demand models.
- Media requests may run for up to **300 seconds** through the durable generation coordinator. Internally polling an asynchronous provider is allowed behind the synchronous public request contract.
- Verify identical-request disconnect/rejoin, one upstream execution, completed R2 cache retrieval, and once-only wallet and Tinybird settlement.
- A route expected to exceed 300 seconds requires a separately approved asynchronous public contract.
- Do not add slow 3D, video, audio, or specialist media merely for catalog breadth. Test repeated real generations and the slow tail, not one successful request.

## Public catalog contract

- Preserve existing functionality during a provider-only move unless the user explicitly accepts a capability change.
- Keep aliases only when they serve a current compatibility purpose. Do not add speculative aliases.
- Set `addedDate` once for a genuinely new public model; never refresh it for provider, price, or metadata updates.
- Descriptions are user-facing for developers: state practical capabilities or differentiators, never repeat the model title, and never mention internal routing.
- Every new brand must map to an existing catalog SVG and render correctly.
- One focused PR per model or tightly coupled family. Secret changes always use their own dedicated PR.
