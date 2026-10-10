---
name: model-management
description: "Add, update, rename, reroute, price, or remove Pollinations text, image, video, audio, embeddings, realtime, OCR, SVG, and 3D models. Use for model research, provider changes, capability or public-endpoint edits, and model PRs."
---

# Model management

Use this workflow for every model change. Keep the implementation minimal, preserve the public contract unless the user explicitly approves a change, and prove provider behavior with real requests.

## Load context first

1. Read the repository `AGENTS.md`.
2. Read the live registry entry, runtime config, handler, schemas, and tests. The repository is the source of truth for what Pollinations currently offers.
3. Read the relevant local active plan when present:
   - `temp/manage_inference.md`
   - `temp/manage_inferenceport.md`
   - `temp/manage_gpus.md`
   - `temp/manage_azure_limits.md`
4. Check GitHub for open or merged PRs that may already implement or conflict with the work.
5. Check current official provider documentation, catalog, pricing, availability, quotas, and deprecation notices. Then probe the exact route; the live response wins over documentation.

The `temp` plans are ignored operational state, not repository truth. When working in a linked worktree where they are absent, locate the primary checkout with `git worktree list` and read them there. Never copy balances, prices, PR statuses, quotas, or candidate rankings into this skill.

Read [operating-policy.md](references/operating-policy.md) before recommending a route or model. Read only the other references needed for the task:

| Task | Required references |
|---|---|
| Find code or run locally | [repository-and-local-testing.md](references/repository-and-local-testing.md) |
| Add, update, reroute, rename, or remove | [change-and-test-matrix.md](references/change-and-test-matrix.md) |
| New model, provider, model ID, or price | [billing-verification.md](references/billing-verification.md) |

## Mandatory confirmation gate

Apply this gate only to a proposed tracked model mutation. Do not turn a
read-only status confirmation, an approval of an already-documented planning
decision, or a correction of an operational fact into a different mutation.
Treat a generic “confirm” as approval only for the exact contract just shown.

Do not edit any model until the user confirms its complete business and inference contract. Inspect the code and provider first; do not ask the user to discover values for you.

Show one complete row per model:

| Field | Required value |
|---|---|
| Canonical name | Public model ID after the change |
| Aliases | Every compatibility alias, or `none` |
| `priceMultiplier` | Exact multiplier after provider cost |
| `paidOnly` | Whether purchased pack balance is required |
| Pollinations GPU | `yes` only if Pollinations operates the production hardware |
| Registry provider | Configured primary provider |
| Primary route | Provider, deployment/host, and exact upstream model ID |
| Best fallback candidate | Provider, deployment/host, exact upstream model ID, and why it is the best viable alternative; or `none found` with the searched routes |
| Pollinations fallback | `use <candidate>` or `none`, with the reason for declining or lacking a viable candidate |

Ask:

> Please confirm: canonical name **X**, aliases **A/none**, price multiplier **M**, paid-only **yes/no**, Pollinations GPU **yes/no**, registry provider **P**, primary route **R**, best fallback candidate **C/none found**, and Pollinations fallback decision **use C/none**. Are all of these correct?

An answer approves only the values shown. If a value is unknown, inferred, conflicting, or route-dependent, label it `UNKNOWN`, explain the evidence, and wait for that exact decision. A batch approval is valid only when every row is complete.

### Public API changes require separate confirmation

Model approval does not authorize adding, renaming, removing, or changing a public endpoint, method, transport, request or response schema, streaming behavior, or event protocol. Do not propose an API-surface change without a concrete user or developer problem it solves.

Before editing, present:

- the user/developer problem and the current public contract;
- the exact proposed routes, methods, transports, schemas, streaming behavior, and events;
- the compatibility reference, resolved by the order in step 4;
- whether the change is additive, behavioral, deprecating, or breaking, and the affected clients;
- the migration, coexistence, and removal plan, or `none`.

State plainly: `This adds/changes the public API: ...` Then ask for explicit confirmation of that exact API change. If the problem, standard, or compatibility impact is unclear, do not edit.

### Secrets are a separate approval

Model approval never authorizes adding, rotating, synchronizing, deploying, revoking, or otherwise mutating a credential. Follow the exact approval wording, execution order, verification, and rollback rules in `AGENTS.md`. Do not duplicate or weaken that process here.

## Workflow

### 1. Reconcile current state

- Resolve aliases to the canonical registry entry.
- API keys store model categories, not model IDs, so a rename never touches
  them. A model that changes category changes which restricted keys reach it;
  state that in the PR.
- Audit every modality registry and every model change merged to `main` since
  the current production revision; production can lag behind `main`.
- If a model or provider is missing from the registry, check `git log --all -- <path>`
  and `gh pr list --state merged --search <model>` before re-adding it — it may have been
  removed on purpose, added and reverted, or replaced.
- Trace every reachable runtime route and any configured fallback.
- Distinguish the configured provider from the provider that served an observed request.
- Compare the intended change with open PRs and active plan entries.
- Remove shipped work from active plans after production verification; do not keep a completed archive.

### 2. Research the exact route

- Use official provider/model sources for release, model identity, pricing, regions, preview status, quotas, rate limits, context, inputs, outputs, tools, caching, and deprecation.
- Deduplicate the canonical model across providers.
- List material route differences. Equal model names do not prove equal capabilities.
- Probe the exact deployment and request shape Pollinations will use.
- For every addition or modification, run a fresh web search across provider catalogs and official documentation to discover viable fallback routes; do not rely only on repository integrations or remembered availability. Verify each serious candidate against its current official model page and pricing, then probe the exact route. Compare checkpoint identity, capabilities, parameters, formats, safety/privacy, availability, latency, price, permissions, and billing. Recommend the best candidate or state `none found`; never omit the fallback decision because the primary route is healthy.
- Inspect provider-managed routing/fallback defaults and controls. Report identity, capability, pricing, residency, and observability tradeoffs.

For direct Novita discovery, use the supported
[model catalog](https://docs.novita.ai/api-reference/model-apis-llm-list-models)
and [account quotas](https://docs.novita.ai/api-reference/quota-list) with an
existing authorized key. Quota queries require `modal=llm`; query `RPM` and
`TPM` separately with `productType=Public Endpoint` and the exact model as
`quotaObject`, then check the returned identity. The OpenAI-compatible base is
`https://api.novita.ai/openai/v1`; probe the exact upstream model using
[Chat Completions](https://docs.novita.ai/api-reference/model-apis-llm-create-chat-completion).
Request `stream_options.include_usage` for streaming and prove terminal usage,
cache/reasoning billing, capabilities and burst capacity through local Gen
before routing traffic. Gateway availability does not prove direct access or
independent capacity: OpenRouter/Vercel routes backed by Novita can share the
same upstream pool. Keep direct provider attribution and charges distinct from
gateway-billed traffic; use the Economics Novita connector guide for supported
billing sources. Preserve the existing public contract and fallback mechanism.

### 3. Confirm the contract

Present the mandatory row and obtain explicit confirmation before editing. If a capability or access change is intentional, state it plainly.

### 4. Implement the smallest complete change

- Canonical public IDs use `<publisher-slug>/<official-model-slug>`. Keep both
  components lowercase, preserve the publisher's model family and version,
  and follow the publisher's public slug when one exists. Never invent, drop,
  or silently advance a version.
- `publisher` is the human-readable publisher (`OpenAI`, `Anthropic`, `xAI`), not
  the inference provider. Keep provider deployment IDs, casing, punctuation,
  and revision suffixes internal when they are routing details rather than the
  publisher's public model identity.
- Never encode an inference provider in a public canonical ID. Deduplicate the
  same publisher model across providers behind one public identity and declare
  automatic routing through the registry's ordered fallback relationship.
- Name hidden fallback registry entries `<public-canonical-id>:<provider>`.
  The public registry key, catalogs, request model, and permissions remain the
  public ID. Keep fallback identity separate from priority: never use
  `:fallback`, numbered fallback suffixes, or priority labels in these IDs.
- For a pinned OpenRouter endpoint, append a meaningful qualifier from the start:
  `<public-canonical-id>:<provider>:<route-qualifier>`, such as
  `google/gemini-2.5-flash-lite:openrouter:vertex-global` or
  `google/gemini-2.5-flash-lite:openrouter:ai-studio`. Distinguish multiple
  deployments through the same provider explicitly. Use lowercase labels;
  never encode priority or the temporary fallback role. Preserve fallback
  registry IDs when changing their order. For provider-managed routing without
  a fixed backend, do not invent an endpoint qualifier.
- The `provider` field and route configuration remain authoritative; the name
  does not select an upstream endpoint. Keep fallback-only entries hidden,
  without aliases, and excluded from catalogs and direct model selection.
  Route-specific cost belongs on the serving definition; callers retain the
  requested public model's price. Use the existing shared fallback mechanism.
- Preserve existing `resolved_model_requested`, `model_used`, `x-model-used`,
  provider, per-attempt, community and cache attribution semantics during a
  canonical rename. Recorded IDs may adopt the new spelling, including hidden
  fallback registry IDs; do not force primary IDs into execution identifiers.
  Explicit primary execution IDs and their analytics/header contract are
  deferred to [#14543](https://github.com/pollinations/pollinations/issues/14543).
  Review affected consumers and any public API changes separately; do not
  silently repurpose `x-model-used` or rewrite historical events.
- Preserve the complete public canonical ID, including existing suffixes, when
  naming an internal route. For example, a route for
  `google/gemini-2.5-flash-lite:search` could be
  `google/gemini-2.5-flash-lite:search:openrouter:ai-studio`.
  These are naming examples, not declarations of configured routes. Link
  routes through explicit registry keys; do not split or strip colon suffixes
  to infer providers or fallback relationships. The fallback must preserve
  the public model's behavior, including search in this example.
- If users must deliberately choose a separately priced or paid-only offering
  of the exact same publisher model, expose it as
  `<public-canonical-id>:paid`, never with the inference provider in the slug.
  Treat it as a separate public contract with its own price, `paidOnly` value,
  permissions, and aliases. Do not use `:paid` for automatic fallback routing.
- When multiple entries are only operations or parameter presets of the same
  publisher model, consolidate them under that model identity and select the
  operation through an explicit endpoint or request field. Do not create a
  second canonical model or make an alias select behavior.
- Reuse existing handlers, transforms, provider configs, schemas, and generic fallback infrastructure.
- Bill from the usage the provider reports with each response: its usage block
  or a billing header such as fal's `x-fal-billable-units`. Do not rebuild the
  provider's formula (rounding, minimums, per-reference units, parameter
  multipliers) from the request. When the route reports nothing, derive usage
  from the request and reconcile it against the provider's billing records.
- Implement only the explicitly approved fallback decision. Use the shared generic fallback system for an approved pair; do not add a model-specific retry layer or an unapproved fallback.
- Expose a confirmed new public capability (per the API-change confirmation above) through two surfaces backed by one implementation: a Pollinations-native route outside `/v1` and a standard-compatible route under `/v1`.
- Resolve the compatibility contract in this order: (1) current official OpenAI API; (2) if OpenAI defines no equivalent, the current published OpenRouter contract — a protocol-design reference here, not an inference-provider fallback; (3) if neither defines the capability, stop for an explicit API-contract decision. Document the exact reference checked.
- Treat `/v1` as a compatibility namespace: match the selected standard's route, transport, request, response, streaming, and event contracts exactly, and keep provider-specific protocols behind the route adapters — never a Pollinations-specific or upstream-provider schema under `/v1`.
- Prefer the selected standard's schema on the Pollinations-native route too; deliberate native divergence requires its own explicit API-change confirmation.
- Do not collapse capabilities with materially different inputs, outputs, or transports into one endpoint merely by switching `model`. Keep distinct operations separate while reusing their shared internal handler, authorization, billing, and observability paths.
- Treat aliases as identity-only: resolve to the canonical model, then discard the requested alias for behavior. Never infer parameters from alias spelling such as `-high`, `-search`, `-reasoning`, or `-1080p`; only explicit request parameters and canonical defaults apply. Keep a separate canonical model if the old behavior must remain.
- Use the resolved registry entry for canonical model identity in generic handlers. Never maintain handler-level lists of model IDs for response, tracking, billing, or routing behavior.
- Canonicalize all stale stored aliases found by the same registry-wide audit in
  one D1 migration PR. Replace old IDs, preserve unrelated fields and array
  order, deduplicate old/new pairs, prove idempotence, and verify all
  audited old-ID counts are zero after deployment.
- Keep every migration statement within D1's per-query CPU limit: one statement
  per alias, and prefilter with `instr()` inside `CASE` so JSON functions never
  run on non-matching rows. A single whole-table JSON scan fails with error
  7429 at production scale (~150k apikey rows).
- Do not rewrite historical analytics using today's mutable aliases.
- Update every consumer of a changed public ID at once.
- New models, including new versions and checkpoints, must have no aliases.
- Preserve existing alias targets until removal.
- Retire all legacy aliases through explicit migrations.
- Keep model names and aliases in `shared/registry/`; use the live model
  catalog for public listings rather than maintaining a duplicate Markdown list.
- OpenRouter registry costs include the 5.5% credit-purchase fee: write each
  non-zero base rate and cost-variant rate as `baseRate * 1.055` (for example,
  `perMillion(0.75) * 1.055`). Include search, cache-storage, and other billable
  adjustments, including provider-reported charges. Keep `priceMultiplier`
  unchanged; prices derive from the fee-inclusive cost. Declare this in the
  registry entries, not a provider-wide transformation. Apply the fee exactly
  once: same-provider fallbacks may inherit fee-inclusive rates; cross-provider
  fallbacks need explicit costs when inheritance would add or omit the fee.
- Keep one PR per model or tightly coupled model-family change.
- Never edit generated `APIDOCS.md`; update the source schema or route.
- Adding or removing a registry `provider` changes the public
  [Service Providers](../../../pollinations.ai/public/legal/SUBPROCESSORS.md)
  page. Update its model-provider line in the same PR;
  `gen.pollinations.ai/test/service-providers.test.ts` fails until it matches.

### 5. Verify end to end

- Run the relevant rows in [change-and-test-matrix.md](references/change-and-test-matrix.md).
- For new models and provider/model-ID changes, run the full declared-modality matrix and [billing-verification.md](references/billing-verification.md).
- Test aliases, permissions, errors, caching, capacity, and `/models` metadata.
- When a fallback is configured, probe it directly and run the same applicable E2E matrix through a forced fallback, including capabilities, parameters, permissions, cache behavior, billing, provider attribution, errors, and expected burst. When no fallback is approved, record the researched candidate and rejection reason.
- Verify all media is fully returned within the supported request-lifetime budget, including the durable-media checks when applicable.
- Record exact evidence and uncertainty in the PR.

### 6. Open the PR

Before publishing:

- Format changed files with the repository formatter.
- Run focused tests and type checks for every touched service.
- Review the complete diff for unrelated changes and dead code.
- Include the approved contract, exact primary and fallback candidates, fallback decision, pricing sources, live probes, E2E results, billing evidence, capacity results, limitations, and deprecation/quota gates.
- Leave the PR draft when a live, quota, latency, safety, or product decision remains unresolved.

#### Scheduled merges and holds

- Apply the repository's `MERGE-HOLD` label and keep the PR draft whenever a model change must wait for a date, provider confirmation, or another unresolved prerequisite. Do not enable auto-merge while held.
- Start every held model PR title with `🕒 YYYY-MM-DD | <type>: <change>` using the earliest planned merge date. If that date is unconfirmed, use `🕒 DATE TBD | <type>: <change>`. Never put the clock/date only at the end or infer a date from an older model's promotion.
- Put the earliest merge date, provider source, exact cutoff/timezone (or explicitly unknown), hold reason, and release conditions at the top of the description. Distinguish the merge date from the production effective date; a date alone does not authorize merging or deployment.
- Verify successor prices for the exact model and each serving route. Mark unconfirmed rates as unconfirmed; do not present an older model's rates or a free placeholder as verified future pricing.
- Prioritize passed merge dates during triage, but recheck provider facts, dependencies, current CI and required live validation before lifting a hold. Unknown dates need clarification, not an invented deadline.
- Remove `MERGE-HOLD` and mark ready only when all release conditions are met and the merge is authorized. Keep the clock/date prefix for scheduled changes so their timing remains visible.

The PR description must include a user-visible change table for each affected model, using its public model ID:

| Model | Action | Change | Before | After | Effective |
| --- | --- | --- | --- | --- | --- |
| `<public ID>` | NEW / UPDATE / RETIRE | Price / Balance / Capability / Availability | Exact previous value | Exact new value | Production deployment or scheduled date with timezone |

- Use `NEW` for a newly available public model ID, `UPDATE` for changes to an existing model, and `RETIRE` for removal from availability, in the PR that removes the model. The registry keeps no retirement dates; note a provider's deadline as a code comment on the affected route.
- Announce a retirement only once it is decided (no other provider will keep the model): merge a PR whose table has a `RETIRE` row with the future date and timezone in `Effective`, e.g. `2026-11-02 00:00 UTC`. News shows it as upcoming until the removal PR merges. To postpone, merge a new `RETIRE` row with the new date; to withdraw, use `Cancelled` as `Effective`. Avoid moving a date earlier.
- Include only changes. Read values from the base and proposed code/catalog; do not infer them from the PR title or invent missing values.
- For prices, include currency, billing unit, and each changed rate (for example input/output per million tokens). For balance access, say `Quest + Paid` or `Paid only`. For capabilities, name what was added or removed.
- For a new model, use `Unavailable` before and include its initial prices, balance access, and capabilities after. For retirement, show `Available → Retired`; include a replacement only when explicitly configured or approved.
- A merge is not a deployment. Use `On production deployment (not live yet)` unless a scheduled date or verified deployment is known. Link an existing notice and its `notice_id` when applicable.
- For a provider-only change with no user-visible difference, state that price, balance access, capabilities, and availability are unchanged instead of adding status rows. Keep provider and verification evidence separately below the summary.

## Completion gate

A model change is not complete until all applicable statements are true:

- The configured model, aliases, provider, route, price, access, modalities, and capabilities match the approved contract.
- Direct-provider and local E2E requests passed for every declared surface.
- The best fallback candidate and use/decline decision are documented; every configured fallback passed direct and forced-fallback E2E verification.
- No existing capability disappeared unless explicitly approved.
- Every non-zero usage field is accounted for and billed at the confirmed rate,
  from the provider's reported usage whenever the route reports it.
- Malformed or rejected requests return useful 4xx responses rather than opaque 5xx responses.
- Capacity and media latency fit the expected production load.
- The catalog description is developer-facing, does not repeat the title, and the publisher logo resolves.
- No public API surface was added or changed without its separate explicit confirmation.
- No unapproved secret or deployment mutation occurred.
- The PR contains only this model or tightly coupled family.
