# Model implementation

Check the [website’s Playground overrides](../../../../pollinations.ai/src/data/playground-model-overrides.json) on every model change. Play reads the public catalog first. Put verified model-specific UI rules that the catalog cannot express in this JSON under the exact canonical ID, with a short reason and source. Add missing entries in the same model PR, update affected entries on changes or renames, and delete obsolete entries on removal. Models that work from catalog data alone need no entry. Review recurring rules monthly for possible registry fields. Discuss any public API addition before promoting it, then remove the duplicate rule.

## Public model and route IDs

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

## Reuse and fallbacks

- Reuse existing handlers, transforms, provider configs, schemas, and generic fallback infrastructure.
- Implement only the explicitly approved fallback decision. Use the shared generic fallback system for an approved pair; do not add a model-specific retry layer or an unapproved fallback.

## API compatibility

- Expose a confirmed new public capability (per the [API-change confirmation](change-approval.md#public-api-changes)) through two surfaces backed by one implementation: a Pollinations-native route outside `/v1` and a standard-compatible route under `/v1`.
- Resolve the compatibility contract in this order: (1) current official OpenAI API; (2) if OpenAI defines no equivalent, the current published OpenRouter contract — a protocol-design reference here, not an inference-provider fallback; (3) if neither defines the capability, stop for an explicit API-contract decision. Document the exact reference checked.
- Treat `/v1` as a compatibility namespace: match the selected standard's route, transport, request, response, streaming, and event contracts exactly, and keep provider-specific protocols behind the route adapters — never a Pollinations-specific or upstream-provider schema under `/v1`.
- Prefer the selected standard's schema on the Pollinations-native route too; deliberate native divergence requires its own explicit API-change confirmation.
- Do not collapse capabilities with materially different inputs, outputs, or transports into one endpoint merely by switching `model`. Keep distinct operations separate while reusing their shared internal handler, authorization, billing, and observability paths.

## Aliases and stored IDs

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

## Pricing, catalog and provider onboarding

- Bill from the usage the provider reports with each response: its usage block
  or a billing header such as fal's `x-fal-billable-units`. Do not rebuild the
  provider's formula (rounding, minimums, per-reference units, parameter
  multipliers) from the request. When the route reports nothing, derive usage
  from the request and reconcile it against the provider's billing records.
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
  [Service Providers](../../../../pollinations.ai/public/legal/SUBPROCESSORS.md)
  page. Update its model-provider line in the same PR;
  `gen.pollinations.ai/test/service-providers.test.ts` fails until it matches.
- Every new canonical provider, including free and fallback providers, must be
  onboarded to Economics in the same change: add its identity/model mappings
  to `operations/dashboards/economics/provider-registry.json` and create or update its
  single `<vendor-id>.json` in the private Drive Vendor journals folder, using
  the [Economics collection workflow](../../economics-provider-collection/SKILL.md).
  Verify category, collection method, review/balance tracking and known accounts;
  record unknowns rather than inventing balances, contracts or forecast rules.
  Reuse existing vendor files; keep private account and contract details out of Git.
