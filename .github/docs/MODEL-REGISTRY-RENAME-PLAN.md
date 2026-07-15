# Model Registry Rename Restart Plan

Status: Planning

Created: 2026-07-14

Revised: 2026-07-15

Superseded PRs: [#12342](https://github.com/pollinations/pollinations/pull/12342), [#12343](https://github.com/pollinations/pollinations/pull/12343)

## Goal

Restart the model rename from current `main` with small, reviewable PRs. Preserve existing names as aliases, keep prices and routing unchanged, strengthen the model-management confirmation process, and add only the runtime Tinybird fields that have an immediate analytics or monitoring consumer.

## Confirmed scope decisions

- [x] Close PRs #12342 and #12343 without merging them.
- [x] Start each replacement PR from the latest `main`; do not reuse the conflicted branches.
- [ ] Reimplement only reviewed, necessary changes. Do not copy the old aggregate diff wholesale.
- [ ] Keep existing `brand`, `category`, `inputModalities`, and `outputModalities` registry metadata unchanged.
- [ ] Do not add `family` or `version` to the registry, API responses, SDK, or Tinybird.
- [ ] Do not add the six descriptive Tinybird columns:
  - `model_brand`
  - `model_category`
  - `model_family`
  - `model_version`
  - `model_input_modalities`
  - `model_output_modalities`
- [ ] Keep both audio-second price columns in their separate PR; they are not part of this plan.
- [ ] Add Tinybird telemetry last, after the rename and documentation are stable.
- [ ] Do not expose provider, GPU, or fallback topology through new public response headers.

## Global safety rules

- [ ] Before modifying any model, explicitly verify its canonical name, aliases, price multiplier, paid status, GPU status, provider, primary route, and fallback route.
- [ ] If any verification value is unknown, conflicting, or inferred, stop and ask the user.
- [ ] Keep every existing public name working as an alias unless a separate deprecation is approved and announced.
- [ ] Do not change pricing, access policy, providers, GPU routing, or fallback behavior as an accidental consequence of a rename.
- [ ] Keep each implementation PR independently reviewable and free of unrelated cleanup.
- [ ] Validate Tinybird against staging first and deploy production only with explicit approval.

## Phase summary

- [x] Phase 0 — Close the two superseded PRs and restart from current `main`
- [ ] Phase 1 — Update the model-management skill with a mandatory confirmation gate
- [ ] Phase 2 — Approve the rename and compatibility contract
- [ ] Phase 3 — Announce the rename
- [ ] Phase 4 — Implement the rename in a fresh compatibility-focused PR
- [ ] Phase 5 — Update documentation in a fresh documentation-only PR
- [ ] Phase 6 — Add five runtime/policy Tinybird columns with their consumers

---

## Phase 0 — Clean restart

### Close the old work

- [x] Add a short comment to PR #12342 explaining that it is superseded by a clean, reduced-scope implementation.
- [x] Add a short comment to PR #12343 explaining that its replacement will be created after the rename merges.
- [x] Close both PRs without merging.
- [x] Preserve links to their reviews and decisions for reference.
- [x] Do not delete the branches until any useful review context has been recorded.

### Establish the new baseline

- [x] Fetch the latest `main` and verify its current checks have no failures.
- [ ] Record model, routing, registry, SDK, MCP, and documentation changes that landed after the old PRs were opened.
- [x] Create each new branch from the latest `main` using the `codex/` prefix.
- [x] Treat current `main` as the source of truth when old PR code conflicts with it.

### Exit criteria

- [x] PRs #12342 and #12343 are closed as superseded.
- [x] The replacement work has no dependency on their conflicted Git history.

---

## Phase 1 — Model-management confirmation skill

Create a small independent PR that changes only the model-management skill and its directly related guidance.

### Mandatory confirmation gate

For every model addition, removal, rename, alias change, metadata change, or routing change, present the known values and ask the user to confirm:

- [x] Canonical public name and aliases
- [x] `priceMultiplier`
- [x] `paidOnly`
- [x] Whether Pollinations operates the production inference GPU
- [x] Registry provider
- [x] Primary runtime route, deployment, and upstream `modelId`
- [x] Fallback provider and route, or explicitly `none`

The confirmation must be explicit. A suggested form is:

> Please confirm: the price multiplier is **X**, paid-only is **yes/no**, Pollinations-operated GPU is **yes/no**, the registry provider is **Y**, the primary route is **Z**, and the fallback route is **A/none**. Are all of these correct?

### Definitions

- [x] Explain that `selfHosted: true` means Pollinations operates the production inference GPUs.
- [x] Explain that a third-party API is not self-hosted merely because that provider runs GPUs.
- [x] Distinguish configured routing from the backend actually used for a request.
- [x] Require a question instead of an assumption for unknown or mixed routes.
- [x] Allow a complete confirmation table for batch changes, but require every row and field to be approved.
- [x] Do not document Tinybird fields before they ship.

### Exit criteria

- [ ] The skill PR is reviewed and merged independently.
- [x] The workflow cannot treat a model change as verified without explicit user confirmation.

---

## Phase 2 — Rename and compatibility contract

Complete this review before editing model identifiers.

### Naming decisions

- [ ] Approve the canonical name for every affected model.
- [ ] Preserve every current public name as an alias.
- [ ] Include exact upstream identifiers as aliases where they differ and are useful.
- [ ] Keep alias collisions as a CI failure.
- [ ] Decide whether responses echo the requested alias or the resolved canonical name.
- [ ] Decide how responses identify a genuinely different fallback model.

### Model confirmation matrix

For every affected model, record and explicitly approve:

- [ ] Old public name
- [ ] New canonical name
- [ ] Preserved aliases
- [ ] Price multiplier
- [ ] Paid-only status
- [ ] Pollinations-operated GPU: yes or no
- [ ] Registry provider
- [ ] Primary route and upstream model ID
- [ ] Fallback route and model ID, or none

### Scope boundaries

- [ ] No family or version fields.
- [ ] No changes to existing brand, category, or modality metadata unless a separately identified factual error must be fixed in another PR.
- [ ] No Tinybird schema or ingestion changes.
- [ ] No audio-second pricing changes.

### Exit criteria

- [ ] Every affected model has an approved row.
- [ ] Naming and response-label behavior have no unresolved decisions.
- [ ] Registry metadata and runtime routing agree before the rename begins.

---

## Phase 3 — Announcement

Announce the compatibility-preserving rename before model-list responses change.

- [ ] Publish the scheduled date in the dashboard and Discord.
- [ ] Link the complete old-name to canonical-name mapping.
- [ ] State clearly that old names continue working as aliases.
- [ ] Explain that model-list responses will show canonical names and aliases.
- [ ] Publish a reminder when the rename merges.

### Exit criteria

- [ ] Users have the agreed warning period.
- [ ] The date, mapping, and compatibility promise are unambiguous.

---

## Phase 4 — Fresh rename PR

Create one new PR from the latest `main`. Its job is only to rename model identifiers and preserve compatibility.

### Registry and runtime

- [ ] Change canonical model identifiers according to the approved matrix.
- [ ] Preserve every previous public identifier as an alias.
- [ ] Update runtime dispatch keys and behavior-affecting defaults.
- [ ] Update SDK, MCP, and frontend defaults only where runtime behavior requires it.
- [ ] Normalize API-key model permissions before canonical comparisons.
- [ ] Keep community-model behavior unchanged.
- [ ] Preserve all confirmed prices, paid status, providers, GPU routes, and fallbacks.

### Compatibility

- [ ] Include aliases in `/v1/models` without duplicating models.
- [ ] Keep `/v1/models` and richer `/models` endpoints consistent.
- [ ] Normalize model-stat lookups so a rename does not create a temporary zero-cost estimate.
- [ ] Apply the approved requested/resolved/used response-label policy.
- [ ] Verify hardcoded names are intentional upstream/backend identifiers or update them.

### Explicit exclusions

- [ ] No model-management skill changes.
- [ ] No documentation-only cleanup.
- [ ] No `family` or `version` fields.
- [ ] No descriptive registry rewrites.
- [ ] No Tinybird changes.
- [ ] No audio-price changes.
- [ ] No new public provider, GPU, or fallback headers.

### Verification

- [ ] Every old name resolves to the same registry definition and runtime route as before.
- [ ] Every new canonical name resolves correctly.
- [ ] Alias collisions fail tests.
- [ ] Legacy-name API-key permissions still work at every permission check.
- [ ] Public and provider prices are unchanged.
- [ ] Paid status, provider, GPU route, and fallback behavior are unchanged.
- [ ] Model endpoints expose canonical names and aliases correctly.
- [ ] Response labels follow the approved policy.
- [ ] Model-stat estimates work with both old and new names.
- [ ] Focused service tests, Biome, CI, and human review pass.

### Exit criteria

- [ ] The new rename PR is merged without pricing, access, provider, GPU, fallback, or permission regressions.

---

## Phase 5 — Fresh documentation PR

Create a new documentation-only branch from `main` after the rename merges. Do not reopen or rebase PR #12343.

- [ ] Update API documentation and examples to canonical names.
- [ ] Update SDK JSDoc, MCP descriptions, and non-runtime frontend copy.
- [ ] Verify every documented name against the merged registry.
- [ ] Show legacy aliases where migration guidance benefits from them.
- [ ] Remove obsolete or invented names found during verification.
- [ ] Do not change validation, runtime defaults, routing, registry metadata, or Tinybird.

### Exit criteria

- [ ] The diff is copy-only and matches production behavior.
- [ ] The fresh documentation PR is reviewed and merged.

---

## Phase 6 — Tinybird runtime and policy telemetry

Create a separate PR only after the rename and documentation are stable. It must include the producers, affected consumers, and a concrete analytics or monitoring use case.

### Five new columns

- [ ] `model_provider_configured` — provider selected from the registry at request start
- [ ] `model_self_hosted_configured` — whether the configured route is a Pollinations-operated GPU deployment
- [ ] `model_self_hosted_used` — whether the backend that actually served the request was Pollinations-operated
- [ ] `model_paid_only` — access policy applied to the request
- [ ] `model_price_multiplier` — multiplier applied to the request

### Existing columns

- [ ] Change existing `model_provider_used` from configured-provider data to proven actual-provider data.
- [ ] Preserve existing `fallback_used`; improve attribution without treating it as a new column.

### Registry support

- [ ] Use the existing registry `provider`, `paidOnly`, and `priceMultiplier` fields.
- [ ] Add only `selfHosted` as new registry metadata because it directly supplies `model_self_hosted_configured`.
- [ ] Set `selfHosted: true` only for confirmed Pollinations-operated production GPU deployments.
- [ ] Do not add family, version, brand, category, or modality telemetry.

### Semantics and nullability

- [ ] Configured fields describe the selected registry route at request start.
- [ ] Used fields describe the backend proven to have served the request.
- [ ] Do not guess used provider or GPU status when fallback attribution is unknown.
- [ ] Use null for historically unavailable or unprovable values.
- [ ] Missing `model_price_multiplier` must never be interpreted as zero.
- [ ] Where a consumer needs one effective provider, use:

```text
effective provider = model_provider_used ?? model_provider_configured
```

### Runtime attribution

- [ ] Carry actual provider, GPU status, and fallback state internally.
- [ ] Do not introduce public `x-provider-used`, `x-self-hosted-used`, or `x-fallback-used` headers.
- [ ] Cover text, image, video, audio, embeddings, realtime, and 3D routes where applicable.
- [ ] Define behavior for success, failure, cache, billed, and unbilled events.

### Consumers

- [ ] Update `op_pollen` for the corrected provider semantics.
- [ ] Update `model_health` for the corrected provider semantics.
- [ ] Update any affected monitoring or alerting pipe in the same PR.
- [ ] Add one bounded endpoint or dashboard consumer that uses configured/used provider, GPU state, paid status, or multiplier.
- [ ] Do not add columns that the shipped consumer does not use.

### Historical policy

- [ ] Treat the five snapshots as authoritative from their deployment timestamp forward.
- [ ] Do not claim that old rows contain metadata that was never recorded.
- [ ] Do not add a registry lookup table in this PR.
- [ ] If historical old-name mapping becomes necessary, design it separately with explicit validity dates.

### Testing and rollout

- [ ] Test configured versus used provider and GPU semantics.
- [ ] Test primary, fallback, unknown attribution, paid-only, and multiplier cases.
- [ ] Test nullable historical values and verify missing multiplier is not zero.
- [ ] Run focused application tests and Biome.
- [ ] Validate with the Tinybird Forward CLI using an explicit staging token and EU host.
- [ ] Stop if validation proposes deleting a datasource or pipe.
- [ ] Deploy and verify staging before requesting production approval.
- [ ] Deploy production only with explicit approval.
- [ ] Verify both Tinybird workspaces contain the same resources after rollout.
- [ ] Record the telemetry deployment timestamp.

### Exit criteria

- [ ] Exactly five new model telemetry columns are deployed and populated.
- [ ] Existing provider and fallback fields have documented, tested semantics.
- [ ] No six descriptive fields or two audio-price fields entered this PR.
- [ ] No internal provider or GPU topology was exposed publicly.
- [ ] Existing economics, health, and monitoring consumers remain correct.
- [ ] The new analytics or monitoring consumer proves the fields are useful.

---

## Final completion checklist

- [ ] Superseded PRs #12342 and #12343 are closed.
- [ ] Every replacement PR started from current `main`.
- [ ] The mandatory model confirmation gate is active.
- [ ] Every renamed model was explicitly verified.
- [ ] Users were notified before canonical names changed.
- [ ] Old names remain supported and discoverable as aliases.
- [ ] Rename and documentation shipped through fresh, focused PRs.
- [ ] Existing brand, category, and modality metadata remained unchanged.
- [ ] Family and version were not introduced.
- [ ] Audio-second pricing remained in its separate PR.
- [ ] Tinybird shipped last with exactly five new columns and a concrete consumer.

## Decision log

- 2026-07-15: Close PRs #12342 and #12343 and restart from current `main` instead of resolving their accumulated conflicts.
- 2026-07-15: Keep existing brand, category, and modality metadata unchanged; do not add family or version.
- 2026-07-15: Drop all six descriptive Tinybird columns from this effort.
- 2026-07-15: Keep the two audio-second price columns in a separate PR.
- 2026-07-15: Retain only five new runtime/policy Tinybird columns, added last with actual consumers.
- 2026-07-15: Add `selfHosted` only when the GPU telemetry consumer is implemented.
