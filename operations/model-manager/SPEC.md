# Model catalog manager agent

Status: internal operations agent with a VM-validated report-only runner and a prepared GitHub Actions pilot workflow. The launcher, encrypted history restoration, and duplicate-run suppression were validated on 5 October 2026. The workflow is not active until merged to `main` and initialized. Model-change workflows remain unimplemented. Credential provisioning, deployment, and model changes retain separate authorization gates.

Confirmed choices: use the `pollinationsagent@gmail.com` account; the first iteration uses APIs only, with no browser agents or page scraping. Store the dedicated account key in SOPS; inject required credentials into the cloud VM at runtime, with no macOS Keychain dependency.

Related work: [Model Catalog & Pricing #11396](https://github.com/pollinations/pollinations/issues/11396).

## 1. Purpose and boundaries

Run an independent specialist through Pollinations' sandbox/VM feature, using Pollinations inference. Keep the catalog useful, accurately described, correctly priced, and ahead of provider retirements.

The agent owns five jobs:

1. Discover new and trending models and capabilities.
2. Verify existing provider costs, public prices, and actual billing.
3. Find equivalent models on cheaper or strategically preferable providers.
4. Verify model identity, capabilities, limits, and integration end to end before adding or updating models.
5. Recommend provider migrations, successor models, and catalog retirements.

Scope covers official text, reasoning, vision, image, editing, video, speech, transcription, music, embeddings, reranking, realtime, OCR, SVG, 3D, and specialist inference. Community submissions remain owned by their existing workflows; they can supply discovery evidence.

Service health monitoring, outage response, routine uptime probes, GPU fleet operations, customer support, and infrastructure cost management are outside this agent. Latency, capacity, errors, and fallback behavior are tested when needed to validate a proposed integration. Runtime failures found incidentally become evidence for the existing health/support workflow.

## 2. Sources of truth

The current repository and deployed catalog define what Pollinations offers. Provider documentation and account pricing define what an exact route claims to offer. Real responses and billing records establish what that route actually does and charges.

Reuse the maintained [model-management skill](../../.claude/skills/model-management/SKILL.md), its [operating policy](../../.claude/skills/model-management/references/operating-policy.md), [change/test matrix](../../.claude/skills/model-management/references/change-and-test-matrix.md), [billing verification](../../.claude/skills/model-management/references/billing-verification.md), and [local testing guide](../../.claude/skills/model-management/references/repository-and-local-testing.md). This spec defines scheduling and discovery; it does not replace those policies or freeze mutable provider preferences and rates.

At each run, reconcile:

- `shared/registry/` for canonical IDs, aliases, modalities, costs, multipliers, access, and fallback pairs.
- Gen routing/configuration, handler, schema, and test files for actual behavior.
- The unauthenticated public catalog with `reliability=all` for what is currently discoverable. This bypasses reliability filtering, not privacy or manual hiding; repository inspection is still required.
- Deployed revisions against `main`, plus relevant open/merged PRs, issues, and accepted decisions. A merged change is not necessarily deployed.
- Existing Economics records and provider/account balances through authorized read-only access. Local Economics and local/staging billing checks must use staging.

Record the repository SHA, deployed revision when observable, policy revision, source URL/API route, provider/account/region, retrieval time, and evidence artifact for every consequential finding. Missing access or conflicting evidence is `unknown`, never zero or a guessed value.

## 3. Schedule and work selection

Initial defaults below are proposed operational settings, not measured optimal thresholds. Version them and review after a 14-day observation period.

| Job | Schedule | Work |
| --- | --- | --- |
| Discovery and lifecycle scan | Daily at 08:00 Europe/Berlin | Collect discovery snapshots; check retirement sources for every configured primary and fallback route; investigate up to five new candidates |
| Pricing and sourcing | Daily in the same run | Compare current official rates; investigate all detected pricing defects; refresh alternative-route comparisons for a rotating seventh of the catalog |
| Detailed billing/capability audit | Weekly, Monday at 10:00 Europe/Berlin | Audit changed/high-spend routes first; schedule remaining models to achieve full catalog audit coverage within 30 days, subject to recorded access/budget gaps |
| Implementation and E2E | On approval or authorized request | One approved model or tightly coupled family per run |
| Targeted research | On authorized Polly request | Research an exact model, capability, provider, price discrepancy, or retirement |

Store timezone-aware schedules; UTC cron dispatch must preserve Berlin wall-clock time across daylight-saving transitions. Overlapping daily/weekly jobs share one queue. There is at most one active run for this specialist in v1.

Priority order: confirmed/credible impending provider retirement, billing or pricing defects, approved implementation, then discovery and sourcing. Alternate discovery and savings investigations at equal priority so neither is starved. Deadline and pricing findings do not disappear when the five-candidate discovery limit is reached.

New observations are stored even when investigation is deferred. Unchanged rejected candidates stay suppressed for 30 days; an exact version, capability, route, lifecycle, or material price change reopens them immediately. Existing issues/PRs are linked and continued rather than duplicated.

## 4. Exact new-model detection

### 4.1 Collection contract

Use official APIs only in the first iteration. If a signal is unavailable through an API, record the gap instead of adding a browser agent or page scraper. Each collector reports `complete`, `partial`, `unavailable`, or `schema_changed`, including its pagination cursor, collection window, query, and cap. Advance a checkpoint only after successful durable storage. On gaps, overlap the next fetch with the previous complete window and deduplicate.

Separate `first_seen_at`, upstream repository creation, upstream version creation, model-lab release date, and last metadata edit. A README edit, re-upload, wrapper, quantization, or renamed slug is not automatically a new underlying model.

The initial research union is bounded to 500 discovery identities/day; additional observations queue for later investigation. Deadline and current-catalog pricing observations are processed separately. Report coverage limits explicitly; discovery never claims to cover every model on the internet.

### 4.2 Hugging Face

Use the documented `HfApi.list_models` client interface: `sort="trending_score"`, `"created_at"`, `"downloads"`, or `"likes"`, with descending order. Fetch model details for shortlisted entries. Preserve upstream score and rank rather than inventing a cross-platform popularity score. The documented expansion fields include model identity/revision, dates, task, license/card metadata, likes/downloads, and inference-provider mappings. [API reference](https://huggingface.co/docs/huggingface_hub/main/en/package_reference/hf_api).

Daily collection:

- Top 50 global trending entries.
- Top 20 trending entries for each task supported by the current integration surface. Derive the task mapping from supported modalities/capabilities and verify provider task identifiers at implementation time.
- Up to 200 newest entries, stopping after crossing the prior successful collection time with a 48-hour overlap. If the cap prevents reaching the checkpoint, report the uncovered interval and continue pagination later.
- Weekly, top 20 downloads per supported task to detect established models missed by short-lived trends.

A candidate enters detailed research when any condition holds:

1. Global trend rank <= 10, or task trend rank <= 5, in one complete daily snapshot.
2. Global trend rank <= 50, or task trend rank <= 20, in two consecutive complete daily snapshots.
3. The model lab publishes a verified release introducing a supported capability or differentiated model, even before popularity is established.
4. It fills an identified catalog gap or implements an explicitly requested capability.

Downloads are an adoption proxy, not billable inference traffic. Record the metric window and never subtract rolling download counts to claim daily downloads. Likes, rankings, and model-card benchmarks are supporting evidence, not quality proof. [Download counting documentation](https://huggingface.co/docs/hub/main/en/models-download-stats).

### 4.3 Replicate

Collect relevant task collections through `GET /v1/collections/{collection_slug}` as candidate seeds. Collection membership is labeled `editorial`, not measured demand. Use `GET /v1/search` for targeted model/capability research. Fetch exact model records for their cumulative `run_count`, upstream identity links, version, and input/output schema. Retrieve recent public entries using documented `GET /v1/models` with `sort_by=model_created_at` and `sort_by=latest_version_created_at`, each descending; ingest up to 200 entries/list with the same checkpoint/overlap rules. Existing authorized Replicate access is required. Model lists, search, a collection and exact-model reads were verified with HTTP 200 during prototype work on 5 October 2026. [HTTP API](https://replicate.com/docs/reference/http).

Maintain a watchlist of up to 200 identities: current-catalog equivalents, active proposals, then newly collected/new candidates. Preserve active and current-catalog entries first; overflow is reported. Store daily exact run counts.

For two complete observations of the same identity separated by 18–36 hours:

```text
runs_per_day = (current_run_count - previous_run_count) * 24 / elapsed_hours
baseline = median(last 7 valid earlier daily run rates)
growth = runs_per_day / max(baseline, 10)
```

Negative counter deltas are invalid observations. Require three earlier valid daily rates before reporting growth. Wider gaps can produce a labeled interval average, but cannot satisfy a daily trend trigger. Do not treat unknown history as zero. Counts measure runs, not unique users, revenue, or successful generations.

Detailed-research triggers:

1. New curated-collection member or verified official release relevant to supported tasks; label it an editorial/release signal.
2. At least 100 runs/day and top 10 daily run rate among tracked candidates in that task on two consecutive valid days.
3. At least 100 runs/day and growth >= 2 on a valid day with enough baseline history.
4. Verified novel capability or a specific catalog gap, irrespective of volume.

These thresholds define our observed Replicate momentum, not a claimed Replicate trending API or a complete market ranking. First-run counts establish the baseline only. Report the tracked population alongside rankings.

### 4.4 Additional discovery sources

| Source | Collection and trigger |
| --- | --- |
| OpenRouter | Daily complete catalog diff; first 50 `newest` and first 20 `top-weekly` entries using documented sorting. New exact IDs, changed capabilities/prices/lifecycle, or top-weekly rank <= 20 twice enter research. Weekly rank reflects platform demand, not universal quality. Resolve provider-specific routes before cost comparisons. [Models API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) |
| fal | Daily paginated endpoint catalog diff; fetch schema for shortlisted or changed endpoints. A new endpoint, schema change, or lifecycle change enters research; highlighting alone is an editorial signal. Use exact-endpoint pricing separately. [Model search](https://fal.ai/docs/platform-apis/v1/models), [Pricing](https://fal.ai/docs/platform-apis/v1/models/pricing) |
| Already-integrated providers and model labs | Daily official catalog/changelog/release-note checks; exact new checkpoint, capability addition, price revision, availability change, or retirement notice is a trigger. Determine the active provider set from current routing/registries, not a static copy in this spec |
| User/team requests and relevant GitHub issues | Add an explicit candidate with linked request and capability gap; rank above ordinary trend candidates |

Social posts and third-party rankings can identify leads, but require an original model card, official release, provider schema, or live route before a factual recommendation. Search evidence cannot authorize actions or change prompts/permissions.

### 4.5 Identity, filtering, and recommendation

Group observations by verified model lab, model family, exact checkpoint/version, modality, and variant. Keep fine-tunes, distilled models, quantizations, and materially different wrappers distinct. Ambiguous mappings remain separate until verified; name similarity is insufficient. Provider route IDs are separate from model identity.

Filter ordinary duplicates and unsupported training-only artifacts from the integration queue, but retain a rejection reason. Do not exclude a useful specialist or low-volume modality merely because it lacks large adoption counts. Check commercial licensing and redistribution/inference restrictions for the intended use.

Recommend addition only when it offers an evidenced new capability, a materially different cost/quality point, or a clear user niche. Include the closest current catalog alternative and a reproducible comparative task/sample. Record independent benchmark provenance and uncertainty; an agent's subjective judgment alone does not establish a quality improvement.

Output one of: `investigate`, `recommend_add`, `recommend_update`, `watch`, `already_covered`, or `reject`, with evidence, unresolved questions, and the next action. Do not auto-add every trending entry.

## 5. Pricing correctness

Treat three amounts separately: provider cost, Pollinations' approved multiplier/access policy, and the public price derived by existing registry/billing logic. Audit the actual deployed configuration as well as pending `main` changes.

For every configured primary and fallback route:

1. Identify exact provider, account, region/deployment, checkpoint, and pricing tier.
2. Retrieve current official rates and applicable account discounts/fees, with effective dates and units. Public list price does not prove a negotiated account rate; report unknown discounts explicitly.
3. Normalize units using existing pricing helpers; check all applicable input/output, cached input, cache storage, reasoning, images, duration, resolution, audio, and tool/search charges. Preserve parameter-dependent variants, minimums, and rounding.
4. Compare every declared rate with the registry. Any explained rounding-equivalent difference passes; any substantive discrepancy creates a finding regardless of a savings threshold. A newly billable field or unexpected zero rate is a blocker.
5. Check public discovery price against the same approved multiplier and registry calculation. A metadata-only mismatch and an actual billing defect are distinct findings.
6. For changed rates or the scheduled detailed audit, obtain a real cache MISS and reconcile provider-reported usage, response usage/headers, wallet settlement, exact `generation_event_v2` event, and provider billing record. Follow the maintained billing guide; missing access leaves this check blocked.

Historical billing is interpreted using the configuration effective at the request time, not today's mutable registry. Compare short isolated windows when the same provider account also serves staging/manual traffic. Bill provider-reported quantities; request-derived usage is allowed only when the provider reports none and billing records validate the derivation.

Report `correct`, `provider_rate_mismatch`, `public_price_mismatch`, `usage_mapping_defect`, `settlement_mismatch`, or `unverified`. Distinguish undercharging from overcharging. A budget or missing source cannot produce `correct`. Changing a multiplier to conceal inaccurate usage is prohibited.

## 6. Alternative-provider sourcing

Here, competitor pricing means the same underlying model offered by competing inference providers. Another service's retail markup is not evidence of our upstream cost.

Enumerate the exact model across the current provider, preferred providers in the maintained operating policy, and other integrated providers. A useful non-integrated provider can be proposed separately with its integration/credential requirements. Verify identity, licensing, input/output modalities, context/output limits, parameters, streaming, tool/JSON support, media formats, safety/privacy terms, region, quotas, provider-managed fallback, and retirement dates.

Compare identical workloads:

- Text: representative observed input/output/cache/reasoning mix, not just one advertised token rate.
- Media: the same resolution, duration, quality, references, audio, and requested format.
- Include mandatory purchasing fees, minimums, discounts, eligible credits, and actual billed units. Preserve the existing fee treatment rather than adding it twice.
- Estimate savings by replaying aggregate billable usage units from the last 30 days against both exact route rate tables. Exclude output-cache hits that did not execute upstream. Missing traffic yields unit/scenario comparisons with monthly savings `unknown`.
- Show ongoing economic cost and near-term cash spending separately; credits have eligibility, balance, and expiry constraints. A lower rate does not justify moving Quest-Pollen-accessible traffic onto a cash-spend route against policy.

Initial sourcing notification threshold: verified >= 10% cost reduction **and** estimated >= USD 25/month saving. This is a prioritization threshold, not permission to migrate. For low-volume/new models, retain cheaper unit prices in the candidate dossier and weekly report; provider retirements, strategic credit use, and requested investigations bypass the threshold.

Recommend the best primary and best fallback candidate with exact route IDs and use/decline reasons. An unavailable route, unverified discount, incompatible checkpoint, or lost capability cannot be described as an equivalent cheaper replacement. Do not add a more expensive fallback under a cheaper user quote without accepted economics.

## 7. Model and capability dossier

Every proposed addition/update has a single evidence dossier covering:

| Field group | Required evidence |
| --- | --- |
| Identity | Lab/publisher, checkpoint/version, model card, license, upstream model ID, region/deployment; stable versus mutable route |
| Product value | Existing alternatives, specific capability/quality/cost distinction, trend provenance and sample coverage |
| Capabilities | Input/output modalities, supported public endpoints, streaming, tools, structured output, reasoning, search, editing/reference inputs, voices/formats and specialist behavior as applicable |
| Limits | Context/output tokens, upload/input limits, dimensions/aspects, duration/fps, reference counts, allowed values/defaults, parameter interactions, expected latency and quota |
| Economics/access | Exact route rates and units, fees/discounts/credits, `priceMultiplier`, `paidOnly`, billing mapping, primary/fallback economics |
| Lifecycle | GA/preview status, retirement evidence/date type, successor and migration options |
| Verification | Direct-provider and local authenticated E2E results, inspected media, regression/type checks, billing reconciliation, remaining unknowns |

Each claim is `documented`, `observed`, `contradicted`, `unknown`, or `not_applicable`, with an evidence link and observation date. Documentation and observations can coexist. Missing fields must not silently become false or zero. Provider-specific capability losses are explicit. Advertise only what the selected Pollinations route supports and applicable tests prove.

“Verify everything” means complete coverage of the model's proposed public contract and its billing/integration paths. It does not mean accepting every upstream marketing claim or claiming universal quality from a small sample.

## 8. Lifecycle and retirement

Check official provider schedules, model/version API lifecycle metadata, account notices through authorized read-only access, and model-lab announcements. Match provider, region/SKU, and exact version. For example, Azure publishes version-specific retirement schedules; do not substitute a family-wide date. [Official schedule](https://learn.microsoft.com/en-us/azure/foundry/concepts/model-lifecycle-retirement).

Distinguish `announced_deprecated`, `announced_retirement`, `earliest_possible_retirement`, `auto_upgrade`, `retired`, and `unknown`. A “not sooner than” date is a lower bound, not a confirmed shutdown. Preserve conflicting dates and use the earliest credible date as the planning deadline.

On first credible notice, notify and propose a plan. Notify again when crossing 90, 60, 30, 14, and 7 days remaining, or when the deadline/successor changes. Past-due items remain actionable. Avoid daily repeats at an unchanged milestone. Do not propose new launches whose earliest credible retirement is under two calendar months away, per operating policy.

Prefer migrating an equivalent exact model to another provider when available. Replacing it with another checkpoint or retiring the public ID requires an explicit capability/compatibility decision. A successor is tested against the existing contract, including aliases, model-scoped keys, fallback pairs, billing, and consumers.

Voluntary retirement reviews are also allowed when a newer catalog entry demonstrably supersedes an older one. Initial low-demand trigger: zero billable upstream executions over a **fully observed** 30-day window, plus no established unique capability. Separately inspect cache-served request counts, restricted-key references, documentation/apps, and consumer usage; zero billed traffic alone is never sufficient to remove a model. Trend decline is not retirement evidence.

Every retirement recommendation includes reason, affected route/public IDs, usage and consumer evidence, successor/fallback options, capability changes, compatibility/migration plan, and proposed date. Models disappearing from a listing are investigated, not silently deleted.

## 9. Approval, implementation, and E2E

Research and recommendations run independently. Tracked model edits require the current skill's complete contract confirmation: canonical ID, aliases, multiplier, paid-only status, Pollinations-operated GPU status, registry provider, exact primary, best fallback candidate, and fallback use/decline decision. Store approval actor, evidence, timestamp, and exact approved values. Material changes invalidate the affected approval. Public API changes and secret mutations retain their separate approval gates.

After approval:

1. Start from current `origin/main`; check competing work and reuse existing clients/handlers/utilities. Use an isolated `codex/` branch/workspace.
2. Implement the smallest complete model change, keeping registry, routing, schemas, discovery metadata, and relevant consumers consistent. Do not edit generated `APIDOCS.md`.
3. Build an applicable checklist from the maintained change/test matrix before testing. Reuse existing tests and fixtures; record pass/fail/blocked/not-applicable for each item. Not-applicable needs a reason.
4. Probe exact primary and selected fallback directly, then call public request shapes through authenticated local Gen. Complete real E2E checks for every declared capability and supported surface; provider-only success is insufficient.
5. Verify streaming/terminal usage, structured output/tools/vision as applicable; inspect actual media dimensions, duration, formats and specialized outputs. Cover declared values, boundaries, parameter-dependent restrictions, and combinations required by the public contract; document the coverage plan before expensive media tests.
6. Prove permissions, paid-only behavior, invalid-input errors, genuine cache MISS/HIT, quotas/capacity, attribution, and exact billing. Every configured fallback receives direct and forced-fallback verification of the same applicable contract.
7. For applicable durable media, prove identical-request disconnect/rejoin, one upstream execution, completed R2 retrieval, one wallet debit and one billed Tinybird event. Apply the maintained request-lifetime boundary checks.
8. Run focused tests, type checks and formatting for touched services. Before Enter tests, run its required decrypt step using authorized existing secrets.
9. Review the diff and evidence. Open one focused PR only after all required validation passes, unless a human explicitly waives a named missing check. An unresolved required test is not bypassed by creating a draft PR.

Missing credentials, account access, budget, provider billing visibility, or runtime support transitions work to `blocked_validation`; ask for the secure location/configuration of existing access and continue independent research. Never request secret values in chat, weaken tests, or mark blocked checks passed.

PRs include the approved contract, exact route/fallback decision, pricing sources, E2E/billing evidence, relevant capacity/lifecycle findings and remaining explicitly waived limitations. Human review/merge and the existing production-promotion/deployment workflows remain separate. Rebase/new route changes invalidate affected evidence and require rerunning affected checks.

## 10. Pollinations VM execution and Polly integration

Use a small deterministic control service outside the ephemeral VM to maintain the schedule, durable queue, leases, approvals, and budgets. Its storage/control deployment belongs to existing operations infrastructure; choosing its exact host is an implementation decision. It invokes the Pollinations sandbox API/SDK via `https://gen.pollinations.ai/alpha/e2b`, not a direct E2B account or a new self-hosted agent fleet.

Each run executes in an owned Pollinations Linux VM with a pinned checkout, specialist prompt and selected maintained skills, a Pollinations-connected coding harness, Node/Python tooling, and the repository's declared test runtime. Share the execution template, not sessions or writable workspaces. Prove that this VM can run the required Cloudflare Workers test pool before implementation is considered ready.

The existing sandbox feature provides compute and leases, not durable scheduling. Managed code agents are currently request-driven Workers, not Docker VM runners. See the [sandbox guide](../../gen.pollinations.ai/src/docs/sandboxes.md), [sandbox routes](../../gen.pollinations.ai/src/routes/e2b.ts), and [code-agent runtime](../../enter.pollinations.ai/src/services/code-agent-runtime.js).

Important provisioning constraint: the default `pollinations` template currently attempts to create a persistent sandbox API key; interactive harness setup can create additional keys. V1 must select an approved existing template without automatic credential creation and connect the harness using already-authorized credentials. Record the actual template ID/build and verify behavior. If none meets the runtime needs, propose a template/provisioning change before enabling scheduled runs. Creating or changing reusable credentials requires separately scoped approval; killing a sandbox must not be assumed to delete its keys.

Use existing authorized credentials at execution time without logging/copying them into tracked artifacts. Keep provisioning ownership and permitted secret names/environments explicit. Research runs have no merge/deploy authority. Approved implementation runs receive only their required repository and test access; private provider invoices/balances stay in internal storage, not public PRs. Separate read-only account evidence from model-generated public reports.

### Cloud credential delivery

Use `POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER` for the dedicated `pollinationsagent@gmail.com` secret key. The launcher reads the chosen cloud secret store, authenticates to the Pollinations sandbox API, and supplies the required run-scoped environment variables to the VM. The VM gets the account key and required provider credentials, not the account's key-management credential or SOPS decryption identity. The runner verifies account identity before assessment; it does not create credentials. Images, source files, report artifacts, and logs contain no plaintext credential values.

Naming convention: use `pollinations-key-agent-<role>` for account-visible key names and `POLLINATIONS_API_KEY_AGENT_<ROLE>` for SOPS fields and injected environment variables. The first account key is `pollinations-key-agent-model-manager`, with the SOPS field above. Keep one dedicated key per agent role; add future keys only when their agent is provisioned. These are credential labels; provider-generated secret values retain their `sk_` format.

| Storage option | Fit |
| --- | --- |
| GitHub Actions secrets | Direct runtime source if Actions schedules and launches the VMs. Workflow steps receive selected secrets through environment variables. |
| Cloudflare secrets | Runtime source if a Worker is the scheduler/controller. Worker bindings supply the credentials used to launch and configure the VM. |
| SOPS | Encrypted, versioned source that can be used by either launcher. The trusted launcher needs an authorized decryption identity, decrypts only required fields, and injects runtime values. |

Selected credential storage: a dedicated SOPS file at `operations/model-manager/secrets/prod.vars.json`, following existing repository encryption rules. Existing GitHub workflows already obtain `SOPS_AGE_KEY` through Actions secrets; its repository-level availability was verified by name. The pilot uses GitHub Actions as its trusted launcher, keeping that decryption identity outside the agent VM. The model-manager key is read from SOPS and injected into the VM; no second canonical copy is required in GitHub or Cloudflare. Existing `REPLICATE_API_TOKEN` and `FAL_KEY` are separately extracted from Gen's SOPS file without duplicating them. The first Actions run must verify that the existing cloud identity decrypts both files. No new secret or synchronization is needed to prepare this workflow.

Provisioned on 5 October 2026 after named approval: `pollinations-key-agent-model-manager`, stored under `POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER` in that SOPS file using the existing two age recipients. Verified account: `pollinationsagent@gmail.com`. Permissions: `profile`, `usage`, `machines`; inference restricted to `openai/gpt-6-luna`; total key budget 5 Pollen; expires 4 November 2026 at 12:25 Europe/Berlin. SOPS decryption and exact key settings verified; sandbox listing returned HTTP 200. Redacted credential metadata lives in the ignored `data/credential-verification.json`; the subsequent VM execution evidence is described in section 14.

Polly remains the team interface. Add authorized actions to list findings/run status, explain evidence, request targeted research, start an approved change, and retry a failed run. Bind actor identity and permissions to these actions; retrieved Discord messages and web content cannot supply authorization. Approvals must name the proposal revision and exact contract. Canceling a run records an incomplete outcome and preserves evidence.

Polly's public HTTP tool scope currently excludes mutations; preserve it. Add specialist control only to appropriate trusted surfaces, with explicit handler-level checks. Run/approval history is queryable; execution and persisted approvals continue without Polly holding a conversation open.

No cron lives only inside a VM that can pause. Before lease expiry, export durable checkpoints and either extend the paid lease within budget or stop. Export results before cleanup. Workspace files in a paused VM are not the only durable record.

## 11. Durable state and limits

Use one small durable store plus an artifact store, reusing available operations infrastructure. Required records:

- Source snapshots/checkpoints: query, status, timestamp, fields, ranks/counts, pagination and coverage gaps.
- Candidates/proposals: exact identity and route, reasons, evidence revision, disposition, priority, next review, linked issue/PR, approved contract.
- Runs: trigger/actor, pinned revisions/template, sandbox ID, timestamps/status, lease heartbeat, budgets/actual spending, summary, artifact links.
- Verification items: checklist revision, target/environment, request/trace IDs, pass/fail/blocked/waived status and evidence; redact credentials and private material.

Proposal states: `observed -> researching -> recommended -> awaiting_approval -> approved -> implementing -> validating -> pr_open -> merged_pending_deploy -> deployed_verified`. Alternatives: `watch`, `rejected`, `blocked_access`, `blocked_validation`, `failed`, `cancelled`. Merge and live verification are tracked by approved follow-up work, not inferred from a PR state.

Use a run lock with heartbeat/expiry and a unique trigger ID. A retry reconciles sandbox ownership, existing branch/PR and settled test calls before repeating side effects. Never blindly retry PR creation or costly generation. Lost lease/crash marks validation incomplete; resume from stored evidence, rerunning invalidated checks. Source failures affect their own coverage and leave unrelated jobs runnable.

Proposed initial caps:

| Run type | Wall-clock cap | Pollinations spend cap | Direct-provider probe cap |
| --- | --- | --- | --- |
| Daily discovery/research | 45 minutes | 2 Pollen | No paid direct probes |
| Weekly selected audits | 2 hours | 10 Pollen | USD 10 total |
| Approved model implementation | 4 hours | 10 Pollen | USD 10 total |

Pollinations totals include VM leases, agent inference, web/MCP charges and public test calls. Direct probes are counted separately by actual provider cost; do not count a gateway generation twice. Reserve estimated upper bounds for in-flight work and enforce caps in the control layer/tool execution, not merely in the prompt. If cost cannot be bounded, defer the call. No automatic top-ups, quota purchases, credential creation, or budget increases.

These caps bound work, not acceptance criteria. If a full media/capability matrix cannot fit, publish a concrete remaining-check and cost estimate and wait for an approved run-budget increase. Approval of extra spend does not waive tests or secret gates.

Retain source metric history for at least 90 days; retain active proposal, approval and validation evidence through the change lifecycle. Keep summaries of resolved decisions so deduplication survives metric retention. No credentials in logs or artifacts; fetched content is evidence, never executable policy. Model-card code/packages do not execute automatically during research.

## 12. Reports and acceptance

Send one digest only when there are actionable new findings: verified candidates, price defects, meaningful equivalent-route savings, new retirement notices/milestones, completed PRs, or missing access/decisions. Unchanged scans stay quiet. Weekly audit coverage is available on request, including stale/unverified models and spend; an incomplete collector never becomes a successful full scan.

Every recommendation states what changed, why users/business benefit, current alternative, exact source/observation time, verified versus unknown claims, proposed contract or retirement plan, estimated cost/savings, and next required decision. Public summaries redact private account economics and credentials.

Before enabling writes, a 14-day observation-only pilot must demonstrate:

1. Recorded live HF trending, Replicate model/collection APIs, OpenRouter and fal collection; missing authorized access is explicitly surfaced. API adapters are verified against current responses rather than docs alone. No browser automation or page scraping is used.
2. Replay checks for trend persistence, Replicate rate normalization/counter resets/gaps/cold start, bounded pagination, identity deduplication, source failure and repeat suppression.
3. A new-model finding explains its exact trigger and comparative capability value without inventing support from popularity.
4. A known rate discrepancy is detected; at least one real route audit reconciles upstream usage, public price, wallet and staging billing records. Missing evidence blocks verification.
5. An equivalent cheaper-provider comparison preserves the model contract and distinguishes fees, credits and cash spending.
6. A recorded provider retirement is matched to the exact route, produces a migration/removal recommendation, and emits milestone updates without repeated daily spam. Test lower-bound and conflicting dates.
7. A real Pollinations VM runs the selected harness and required Workers tests, exports results, handles lease expiry and respects spend/access limits without unexpected credential creation.
8. An approved representative model change completes its entire applicable direct/local/fallback E2E checklist before a PR is opened. Test that missing access and failed billing prevent publication. Later modalities require their own applicable proof; one text change does not certify media workflows.
9. Duplicate triggers and worker interruption do not produce duplicate PRs, overlapping jobs, or lost decisions. Polly can retrieve run evidence and authorization rejects unsupported callers.

Pilot success measures: supported source coverage, documented candidate dispositions, verified billing defects, projected and later realized savings, lifecycle lead time, E2E coverage, duplicate/noise rate, and cost per useful finding. Raw number of added models is not the objective.

## 13. Implementation sequence and open decisions

1. Add collectors, snapshots, deterministic detection and a report-only runner. Establish API access and source coverage.
2. Prove execution/testing inside Pollinations VMs and durable scheduler integration. Select an existing non-auto-login template and execution harness; add a template only if necessary.
3. Add pricing/account reconciliation, alternative-route comparisons and lifecycle dossiers. Run the 14-day pilot and calibrate proposed thresholds/budgets.
4. Add actor-bound contract approvals, isolated implementation and mandatory E2E gates. Enable PR creation after the pilot and representative integration proof.
5. Connect authorized Polly controls and existing promotion/deployment follow-up; leave other specialist agents for their own scopes.

Full-agent launch decisions still required: owning team, implementation harness, notification destination, audit/implementation budget acceptance, and any departure from the balanced discovery/savings priority. The report-only pilot uses GitHub Actions with encrypted artifacts and the existing `codex` VM template. This does not yet prove a coding harness or model-change E2E. The selected account is `pollinationsagent@gmail.com`. No new customer API, dashboard, generic multi-agent framework, or credential provisioning is required for this pilot.

## 14. Report-only prototype

Run from the repository root:

```sh
node --import tsx operations/model-manager/run.ts --secrets /absolute/path/to/authorized/sops.json --assess
node --test operations/model-manager/run.test.mjs
```

The runner reuses the registry's public price calculation, collects HF/OpenRouter/fal/Replicate APIs, and saves private daily snapshots plus `report.json` and `report.html` under `operations/model-manager/data/` (ignored). Existing `REPLICATE_API_TOKEN` and `FAL_KEY` may come from the environment or the named fields of the supplied SOPS file; credential values are never printed. `--assess` reads `POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER` from those same sources and verifies the selected account before making one bounded inference call. The deployed VM uses injected environment variables; SOPS decryption remains with the trusted launcher. The default assessment cap is 0.1 Pollen; no keys are provisioned. Exit 2 means the report was saved with explicit source gaps.

This is discovery evidence and review leads, not a complete catalog audit. It implements HF rank persistence, observed Replicate run growth, revision changes, public checkout/live price drift, OpenRouter sourcing leads, lifecycle leads, and repeat suppression. API collections are seeds; Replicate's image-editing collection is `image-editing`, not `image-to-image`. Missing access, pagination caps, and rate limits remain visible.

### Verified Pollinations VM run

On 5 October 2026, the trusted test launcher used the Pollinations gateway and E2B SDK 2.52.0 to create a ten-minute `codex` VM, template ID `u1yrkaokyjzef8qchho5`, with 2 vCPU and 2 GiB memory. It supplied a source bundle pinned to repository revision `f849e3dd39aa896f73467ebc85fd72131d43f30b` plus the current agent files, recorded their SHA-256 hashes, installed locked dependencies, and ran Node 24.10.0 after verifying the official archive checksum. The SOPS identity stayed outside the VM; the selected keys were supplied only as command environment variables. This template did not create additional account keys.

- Agent tests: 8 passed.
- Existing Gen Workers test pool: 5 passed in `test/pollen-precision.test.ts`.
- Live API scan: HF 476 identities, OpenRouter 466, fal 1,000, and Replicate 435; 348 research leads were saved. HF and Replicate pagination caps and fal's page-11 HTTP 429 were recorded as coverage gaps, so exit 2 was expected.
- Pollinations assessment: `openai/gpt-6-luna` completed with 1,125 prompt and 392 completion tokens reported by the provider.
- Measured dedicated-key spending: 0.00588655 Pollen for the successful attempt, including compute and inference; 0.02707405 Pollen including setup retries.
- Reports and evidence were exported before cleanup. The successful VM `i8ou4x684a8mbnn1kptz6` and all earlier test VMs were removed.

Private evidence is in the ignored `data/vm-test/attempt-5/` directory: `verification.json`, `report.html`, `report.json`, the daily snapshot, and stage logs. Earlier retries exposed source-bundle omissions and the template shell's older Node PATH; the working bundle includes Gen public assets and declared raw documentation/UI imports, and commands explicitly select Node 24. The initial 512 MiB template's dependency install terminated; its cause was not established. No service tests were changed to obtain a pass.

Still required before full-agent launch: exact-route/account price reconciliation, official lifecycle notice re-verification, capability and authenticated generation E2E, Replicate task-specific top-10 persistence, weekly HF download backstop, coding-harness validation, and successful pilot review. VM execution does not approve PR creation or production model changes.

### Scheduled pilot and saved history

The internal [pilot workflow](../../.github/workflows/models-manager-pilot.yml) runs only in `pollinations/pollinations` on `main`, with read-only repository/Actions permissions and one concurrency group. Merge the prepared changes, then dispatch **Models / Report-only manager pilot** with `initialize: true` once. Subsequent daily runs target 08:00 Europe/Berlin using two UTC slots and a DST-aware selector; Actions may dispatch late. Manual runs use the same history and concurrency group. Initialization is an explicit first-run control, not a credential mutation. Missing or expired history never automatically starts a fresh paid pilot.

`launch.mjs` creates the pinned non-auto-login VM with a ten-minute lease and kill-on-timeout lifecycle, transfers a source bundle without secrets, restores prior snapshots and repeat-suppression state, runs the scoped checks/scan/assessment, exports evidence, and kills the VM in `finally`. SIGINT/SIGTERM cancel pending SDK work and trigger cleanup. No lease extension or paid-call retry is automatic. An already-recorded Berlin day starts no VM or inference call. The pilot stops paid work after 14 calendar days or a 2-Pollen aggregate budget. The launcher reserves 0.1222 Pollen per run: 0.0222 for ten minutes of 2-vCPU/2-GiB compute at the [full upstream tariff](https://e2b.dev/pricing), plus the existing 0.1-Pollen assessment limit. Dedicated-key spending reconciles interrupted runs; unverified spending consumes the reservation. The existing 5-Pollen key cap and expiry remain unchanged.

Each run compresses reports, at most 90 daily snapshots, suppression state, pilot metadata, and redacted verification evidence, then encrypts the payload with SOPS using the existing model-manager recipients. Only `state.vars.json` is uploaded as `model-manager-state`, retained for 90 days. Plaintext state, logs, and credential material are never uploaded. Artifacts in this public repository are downloadable by readers, so encryption is required. The next run restores only artifacts from this workflow's trusted `main` runs, including an earlier attempt of the current run. Failed runs preserve their evidence and earlier checkpoints. State files have a fixed filename allowlist; restored source content is not executed.

Operators can inspect an artifact using an existing authorized SOPS identity:

```sh
node operations/model-manager/state.mjs restore --file /absolute/path/state.vars.json --data /absolute/private/output
node operations/model-manager/launch.mjs --out /absolute/private/output
```

Validation on 5 October 2026: 13 local tests, actionlint, and scoped TypeScript checks passed. The reusable launcher restored one real snapshot and suppression state into VM `i60ryvt6ogqha176ynv1b`; 9 agent tests, 5 Workers tests, and the API scan/assessment passed. It saved 349 research leads with three explicit source gaps, used 0.0057695 Pollen, and removed the VM. Actual report-state SOPS encryption/restoration preserved file contents; rerunning the restored day skipped paid calls and retained the successful verification evidence. Private evidence is in ignored `data/scheduler-validation/attempt-3/`. Two packaging retries cost 0.0111 Pollen before this successful run; the source-bundle regression test now verifies required assets, exclusion of secrets, and absence of macOS sidecars that would be misread as SQL migrations. No service tests were changed.

GitHub-hosted artifact upload/download and cloud SOPS decryption still need the first workflow run after merge; local/VM tests do not establish that the workflow has been deployed. The 14-day observation window is preparation for review, not automatic permission to enable model changes. No Discord/email messages, health monitoring, weekly billing audits, PR creation, or customer-facing feature changes are enabled by this workflow.
