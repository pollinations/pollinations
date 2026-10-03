# Responses parameter compatibility

Addresses #14586. Design only — no runtime change in this PR.

## Goal

Cut avoidable 4xx on `POST /v1/responses` from unsupported sampling fields,
without changing reasoning defaults, tools, output constraints, token limits,
billing, or retry behaviour.

## Constraints (from investigation)

- Chat Completions already strips unsupported params via per-model transforms
  (`#14585`). Those transforms expect Chat-shaped bodies and run before model
  defaults.
- Applying the full Chat transform chain to Responses risks mutating reasoning
  settings.
- Prefer explicit per-model allow/deny helpers over provider/name conditionals.

## Proposal

1. **Inventory** — for each Responses-capable model, record which of
   `temperature`, `top_p`, `top_k`, `frequency_penalty`, `presence_penalty`,
   `seed`, `n`, `stop`, `logit_bias`, `logprobs` are accepted (stream +
   non-stream, with and without reasoning).
2. **Policy** — unsupported tuning fields are **dropped with a warning header**
   (`x-pollinations-dropped-params`) rather than 4xx, except where the upstream
   treats the field as unsafe (then keep a clear 400).
3. **Sharing with Chat** — extract pure `omitUnsupportedSampling(model, body)`
   helpers per model family. Chat keeps calling them inside its transform pipe;
   Responses calls the same helpers on a Responses-shaped clone that never goes
   through Chat-only reasoning transforms.
4. **Out of scope** — model-name rewriting, guessed aliases, retries, billing.

## Rollout

1. Land this design.
2. Add the inventory table + unit tests for the strip helpers (no live matrix).
3. Wire Responses only after Chat continues to pass existing suites.
