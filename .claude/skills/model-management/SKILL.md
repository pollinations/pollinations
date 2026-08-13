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
| Pollinations fallback | Complete alternative route or `none` |

Ask:

> Please confirm: canonical name **X**, aliases **A/none**, price multiplier **M**, paid-only **yes/no**, Pollinations GPU **yes/no**, registry provider **P**, primary route **R**, and Pollinations fallback **F/none**. Are all of these correct?

An answer approves only the values shown. If a value is unknown, inferred, conflicting, or route-dependent, label it `UNKNOWN`, explain the evidence, and wait for that exact decision. A batch approval is valid only when every row is complete.

### Public API changes require separate confirmation

Model approval does not authorize adding, renaming, removing, or changing a public endpoint, method, transport, request or response schema, streaming behavior, or event protocol. Do not propose an API-surface change without a concrete user or developer problem it solves.

Before editing, present:

- the user/developer problem;
- the current public contract;
- the exact proposed routes, methods, transports, schemas, streaming behavior, and events;
- the compatibility reference: current OpenAI API, or OpenRouter when OpenAI defines no equivalent;
- whether the change is additive, behavioral, deprecated, or breaking, including affected clients; and
- the migration, coexistence, and removal plan, or `none`.

State plainly: `This adds/changes the public API: ...` Then ask for explicit confirmation of that exact API change. If the problem, standard, or compatibility impact is unclear, do not edit.

### Secrets are a separate approval

Model approval never authorizes adding, rotating, synchronizing, deploying, revoking, or otherwise mutating a credential. Follow the exact approval wording, dedicated-PR requirement, execution order, verification, and rollback rules in `AGENTS.md`. Do not duplicate or weaken that process here.

## Workflow

### 1. Reconcile current state

- Resolve aliases to the canonical registry entry.
- Trace every reachable runtime route and any configured fallback.
- Distinguish the configured provider from the provider that served an observed request.
- Compare the intended change with open PRs and active plan entries.
- Remove shipped work from active plans after production verification; do not keep a completed archive.

### 2. Research the exact route

- Use official provider/model sources for release, model identity, pricing, regions, preview status, quotas, rate limits, context, inputs, outputs, tools, caching, and deprecation.
- Deduplicate the canonical model across providers.
- List material route differences. Equal model names do not prove equal capabilities.
- Probe the exact deployment and request shape Pollinations will use.
- Inspect provider-managed routing/fallback defaults and controls. Report identity, capability, pricing, residency, and observability tradeoffs.

### 3. Confirm the contract

Present the mandatory row and obtain explicit confirmation before editing. If a capability or access change is intentional, state it plainly.

### 4. Implement the smallest complete change

- Reuse existing handlers, transforms, provider configs, schemas, and generic fallback infrastructure.
- Do not add speculative abstractions, compatibility shims, or fallbacks.
- Expose each new public capability through two API surfaces backed by one implementation:
  - a Pollinations-native route outside `/v1`; and
  - a standard-compatible route under `/v1`.
- Resolve the compatibility contract in this order: (1) current official OpenAI API; (2) if OpenAI defines no equivalent, the current published OpenRouter contract; (3) if neither defines the capability, stop for an explicit API-contract decision. Document the exact reference checked. OpenRouter is the protocol-design fallback here, not an inference-provider fallback.
- Treat `/v1` as a compatibility namespace. Match the selected standard's route, transport, request, response, streaming, and event contracts exactly. Never invent a Pollinations-specific schema under `/v1`.
- Prefer the same selected standard's schema on the Pollinations-native route too. A route outside `/v1` does not by itself justify another schema; any deliberate native divergence requires its own explicit API-change confirmation.
- Keep provider-specific protocols behind the route adapters. Do not expose an upstream provider's schema under `/v1` unless it is the selected compatibility standard.
- Do not collapse capabilities with materially different inputs, outputs, or transports into one endpoint merely by switching `model`. Keep distinct operations separate while reusing their shared internal handler, authorization, billing, and observability paths.
- Treat aliases as identity-only: resolve to the canonical model, then discard the requested alias for behavior. Never infer parameters from alias spelling such as `-high`, `-search`, `-reasoning`, or `-1080p`; only explicit request parameters and canonical defaults apply. Keep a separate canonical model if the old behavior must remain.
- Use the resolved registry entry for canonical model identity in generic handlers. Never maintain handler-level lists of model IDs for response, tracking, billing, or routing behavior.
- When a migration canonicalizes stored model IDs, keep the mapping in the migration only. Do not add a runtime normalization layer; require the migration to complete before the new registry is deployed.
- Update every consumer of a changed public ID at once.
- Keep one PR per model or tightly coupled model-family change.
- Never edit generated `APIDOCS.md`; update the source schema or route.

### 5. Verify end to end

- Run the relevant rows in [change-and-test-matrix.md](references/change-and-test-matrix.md).
- For new models and provider/model-ID changes, run the full declared-modality matrix and [billing-verification.md](references/billing-verification.md).
- Test aliases, permissions, errors, caching, capacity, and `/models` metadata.
- Verify all media is fully returned within the supported synchronous time budget.
- Record exact evidence and uncertainty in the PR.

### 6. Open the PR

Before publishing:

- Format changed files with the repository formatter.
- Run focused tests and type checks for every touched service.
- Review the complete diff for unrelated changes and dead code.
- Include the approved contract, exact provider/model ID, pricing source, live probes, E2E results, billing evidence, capacity results, limitations, and deprecation/quota gates.
- Leave the PR draft when a live, quota, latency, safety, or product decision remains unresolved.

## Completion gate

A model change is not complete until all applicable statements are true:

- The configured model, aliases, provider, route, price, access, modalities, and capabilities match the approved contract.
- Direct-provider and local E2E requests passed for every declared surface.
- No existing capability disappeared unless explicitly approved.
- Every non-zero usage field is accounted for and billed at the confirmed rate.
- Malformed or rejected requests return useful 4xx responses rather than opaque 5xx responses.
- Capacity and media latency fit the expected production load.
- The catalog description is developer-facing, does not repeat the title, and the brand logo resolves.
- No unapproved secret or deployment mutation occurred.
- The PR contains only this model or tightly coupled family.
