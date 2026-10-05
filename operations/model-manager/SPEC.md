# Model catalog manager agent

Internal Pollinations operations agent using the same hosted-agent, Computer and sandbox APIs available to clients, under `pollinationsagent@gmail.com`. This does not add a customer-facing product. The first iteration is API-only: no browser agents or scraping.

## Pilot: implemented scope

The report-only pilot collects Hugging Face, Replicate, OpenRouter and fal observations, compares checkout/deployed public prices, and produces research leads. It does not add/update models, verify provider bills or capabilities, independently confirm retirement notices, open PRs, deploy, or send Discord/email messages. Model health, support and infrastructure monitoring belong to other workflows.

The daily GitHub Actions summary shows up to five new leads and source gaps. Successful runs publish those leads and the full agent assessment as dated comments in [the public pilot issue](https://github.com/pollinations/pollinations/issues/16517), readable without SOPS access. Publication excludes credentials, account metadata, raw responses and execution logs. Full JSON evidence and checkpoints remain in the SOPS-encrypted artifact. Names, advertised rates and provider metadata are discovery evidence; they do not establish exact-route equivalence, tested capabilities or billing correctness.

Priority: retirement reviews, price discrepancies, configured-model version changes, sourcing leads, discovery, then unmatched lifecycle leads. Successfully assessed findings are suppressed for 30 days; changed revisions, prices or deadlines reopen them. Failed and unselected findings stay in a persisted pending list, ordered by the same priority. Each run assesses at most five; the remaining count is explicit in the report. No pending leads means no assessment call. The assessment runs through the private hosted prompt agent `community/pollinations-ai/model-manager-agent`, with one non-streaming assessment call and one deterministic Computer write from the VM runner. The runner accepts at most five findings in 12,000 bytes of JSON evidence and requests at most 1,200 output tokens. The dashboard owns the prompt, base model and tools; the pilot uses no model-selected tools. Evidence includes up to six checkout models per mapped category (12 total), with short advertised capabilities; this is a limited comparison inventory, not proof of equivalence. The prompt requests up to five evidence-specific actions, with no padding. Missing/partial sources are visible and do not fail unrelated collection.

## Exact discovery rules

Use each platform’s native metric; do not invent a cross-platform popularity score. Separate first observation, repository creation, checkpoint release and metadata edits. Identity matches currently use exact IDs/aliases and remain unverified until upstream checkpoint and configured route are confirmed.

| Source | Pilot collection | Research trigger |
| --- | --- | --- |
| Hugging Face | Top 50 global trending, top 20 per supported task; up to 200 newest records. Newest overlaps the previous run by 48 hours, or seven days on cold start. A capped interval is partial. | Global rank ≤10 or task rank ≤5 immediately; global ≤50 or task ≤20 on two distinct daily observations separated by 18–36 hours; first-observed entries from newest listings after a baseline. |
| Replicate | Curated text/image/video/speech collections; recent model and version lists, capped at 200 each; exact-model run counts for a watchlist capped at 200. | Newly observed curated membership is an editorial seed, not measured demand; first-observed model listings; changed exact versions; ≥100 observed runs/day and ≥2× baseline growth. |
| OpenRouter | Catalog, first 50 newest and first 20 weekly-ranked entries. | First-observed IDs, changed versions, weekly top 20 on two distinct daily observations 18–36 hours apart, matched expiration dates, or headline token rates below checkout cost. |
| fal | Public endpoint catalog, up to 20 pages of 100. Pagination or rate-limit gaps are explicit. | First-observed endpoints, changed metadata revisions, and deprecated endpoints. Highlighting remains editorial evidence. Authenticated pricing/schema collection is deferred until a consumer needs it. |

Replicate momentum uses cumulative counts:

```text
runs_per_day = (current_count - previous_count) × 24 / elapsed_hours
baseline = median(last seven valid earlier daily rates)
growth = runs_per_day / max(baseline, 10)
```

Only 18–36-hour intervals with nonnegative deltas qualify. Three earlier valid daily rates are required for growth. Cold starts, counter resets and wider gaps cannot trigger measured momentum. Runs do not measure unique users, successful outputs or revenue.

Compare identities and revisions against their last actual observation across retained history. Absence in a partial scan is neither removal nor proof of a new release. Unknown IDs are labeled first observed, with release/identity unverified. Persistence requires adjacent distinct daily observations; failed days do not count.

Each source has a 45-second deadline that cancels active requests and prevents further requests. Completed observations are retained, with deadline and pagination gaps explicit. OpenRouter requests all output modalities, including its newest and weekly queries.

Official interfaces: [Hugging Face](https://huggingface.co/docs/huggingface_hub/main/en/package_reference/hf_api), [Replicate](https://replicate.com/docs/reference/http), [OpenRouter](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), [fal](https://fal.ai/docs/platform-apis/v1/models). Replicate model listing and collections work through the HTTP API; a browser is unnecessary.

Known pilot gaps: weekly HF download backstop, Replicate task top-10 persistence, lab-release/official lifecycle checks, verified identity grouping/licensing, provider-account price reconciliation, and capability/E2E probes. The five-item limit bounds assessment and digest, not collection or full report size. Downloads are an adoption proxy, not daily inference traffic.

## Execution, credentials and durable evidence

[The workflow](../../.github/workflows/models-manager-pilot.yml) runs only in the upstream repository on `main`, with read-only contents/actions permissions, issue-comment write access and one concurrency group. It uses one daily 06:00 UTC schedule (08:00 Berlin in summer, 07:00 in winter); dispatch can be delayed. Manual runs share the same state. A successfully completed Berlin day starts no VM or inference call. A failed assessment does not complete the day. An explicit same-day retry reuses the saved batch without recollection, subject to the same spending checks; paid calls are never retried within a run. The next daily collection carries forward pending findings with their observation times.

The deterministic collector and retry state stay in the sandbox. Authenticated Replicate collection needs controlled credential injection, and full research evidence exceeds Computer’s tool-output limit. The prompt agent receives only bounded selected evidence.

The private prompt agent executes the assessment. Its instructions, base model and empty tool selection are stored by the existing agent API and editable in **My Models**. `operations/model-manager/agent.json` is the reviewed initial registration payload, not a runtime prompt override. Changing the dashboard prompt takes effect without GitHub sync. There is no dedicated code-agent deployment or source-repository dependency.

The VM runner first saves the completed inference, then writes a readable copy to `/workspace/model-manager/assessment-YYYY-MM-DD.json` through the existing Computer MCP API. A failed Computer write leaves `storage_pending` and retries only storage, with no new inference. The encrypted checkpoint remains authoritative for discovery history, accounting and recovery.

The trusted host installs the root lockfile dependencies for registry/build code and the separate E2B launcher package, then builds one Node-compatible ESM executable from the runner and existing registry/pricing helpers. `launch.mjs` uploads that executable and compact history to a pinned Pollinations VM through `https://gen.pollinations.ai/alpha/e2b`. The VM uses its existing Node runtime: no monorepo install, downloaded runtime, source archive or daily test suite. Collection and assessment run as separate bounded commands; the trusted host exports collection evidence before starting assessment. Tests run in PR CI.

The VM has a ten-minute kill-on-timeout lease. The launcher verifies its template/resources and ownership, exports results, and kills it in `finally`; signals cancel SDK work and trigger cleanup. It does not extend leases or automatically retry paid calls. A detected existing pilot VM blocks a second paid run.

The pilot stops after 14 Berlin calendar days or 2 Pollen total. Each run reserves 0.1222 Pollen: at most 0.0222 for ten minutes of 2-vCPU/2-GiB compute at the full tariff plus 0.1 for assessment and its Computer write. The assessment reservation uses the live prompt-agent catalog rates, up to 32,000 prompt bytes (the UI’s 8,000-character maximum), 1,200 output tokens and the shared Computer tool price. Every inference attempt refreshes agent availability and pricing without changing the saved evidence. Account-key spending reconciles interrupted runs; unverified spending consumes the reservation. An exceeded reservation stops further work pending review. Budget checks precede paid work and do not replace validation requirements.

Credential sources:

- `operations/model-manager/secrets/prod.vars.json`: `POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER`.
- Existing `gen.pollinations.ai/secrets/prod.vars.json`: `REPLICATE_API_TOKEN` for read-only API collection.
- Existing Actions `SOPS_AGE_KEY`: decrypts selected fields on the trusted host; never enters the VM.

The dedicated account key is named `pollinations-key-agent-model-manager`, permits profile/usage/machines, excludes key management, and allows only the private agent and its base model `openai/gpt-6-luna`. The private-agent permission was separately approved and verified on 5 October 2026; no key creation or rotation was needed. Its existing 5-Pollen cap and 4 November 2026 expiry remain in place (the dashboard advanced the expiry timestamp by one second on save). Future agents use `pollinations-key-agent-<role>` and `POLLINATIONS_API_KEY_AGENT_<ROLE>`; provision them only when needed with separate scoped approval. No runtime Keychain dependency or duplicated provider credentials.

Retain the 14 pilot snapshots with only observation time, source/query status, identities, revisions, run counts and trend signals. Current reports retain full collected metadata; historical catalogs, schemas and descriptions are not copied. Keep the pending list, exact selected assessment input, suppression state, pilot accounting and redacted execution proof. Only successful selected findings leave the pending list. A saved completed response can be settled again without inference after an interrupted state write; a failed inference may incur another inference charge on an explicit retry; a failed Computer write reuses the saved inference. SOPS-encrypt reports/checkpoints into one artifact retained for 30 days. The same sanitized Markdown report supplies the CI summary and public issue, including findings, coverage and the generated assessment. Account metadata and logs stay encrypted. Publication uses the built-in GitHub Actions token on the trusted host, never in the VM; it requires successful evidence from the current Berlin day. A same-day rerun can retry failed publication without repeating paid work, and the observation timestamp prevents duplicate comments. Summary Markdown is rebuilt for each run, never restored; skipped/failed runs show their current status instead of old results.

GitHub is not connected to this account’s app connector yet. Keep the verified CI issue publisher until the client connector is connected and its required operations are tested. CI currently schedules the VM collector and publishes its result; it does not host the assessment prompt or model execution.

Restore only this workflow’s trusted `main` artifacts, including an earlier attempt of a rerun. Missing, deleted or expired evidence must not silently restart a paid pilot. Restored filenames are allowlisted, existing files are not overwritten, and collected source content is never executed. Artifacts provide durable evidence; an evictable cache is insufficient.

## Manual sandbox integration validation

`node operations/model-manager/launch.mjs --verify-stack --out /absolute/private/output`, or the existing workflow with `verify_stack: true`, uses the same launcher and Pollinations sandbox API in manual validation mode. It does not activate the daily pilot or publish a report. The trusted host uploads the exact tracked working checkout and injects only existing dev credentials needed for the GPT-6 Luna probe and staging billing; the SOPS identity stays outside the VM.

The sandbox installs checksum-verified Node 24.10.0 and the repository lockfile, builds the existing SDK/UI and Enter/Gen bundles, migrates one isolated local D1, and starts both workers with shared disposable persistence. It seeds only the hash of the existing authorized runtime key into local test state; no reusable key is created. It registers the private prompt-agent payload through local Enter and calls it through local Gen. Validation requires real provider usage, wallet settlement, identical-request cache retrieval without a second debit, and exactly one charged staging Tinybird event, with total tracked price matching the wallet (the free parent agent also emits an event). Both workers and the VM are cleaned up; the VM has a 20-minute kill lease and a 0.1-Pollen compute reservation. Evidence is SOPS-encrypted by CI.

Local fixture account scopes permit profile, usage and agent administration only inside the disposable database. The production runtime key retains its existing restricted permissions. Enter starts from Vite's generated Worker configuration; the agent is registered before Gen starts so its first cached catalog contains the fixture. No production databases or deployments are used.

This proves the development environment, not every model capability. For an approved candidate change, run the maintained modality-specific tests and billing matrix in this same sandbox before creating its PR. Missing evidence fails validation; daily research does not imply capability approval. Automated repository edits and candidate PR creation remain a separate workflow requiring a confirmed model contract.

## First activation and review

1. Merge the reviewed PR to `main` after validation.
2. Dispatch **Models / Report-only manager pilot** with `initialize: true` once. This is a separate activation decision; preparing the PR does not start the pilot.
3. Verify hosted SOPS decryption, artifact restoration and VM cleanup on the first Actions run. Local/VM tests cannot establish that cloud credentials work.
4. Review collected leads, missing coverage, duplicate suppression and actual spend after the 14-day observation window, or when the budget stops the pilot. Disable the workflow schedule in GitHub at review. Stopped/skipped launches do not upload artifacts or refresh retention. Do not automatically enable model changes.

Inspect downloaded evidence with an existing authorized SOPS identity:

```sh
node operations/model-manager/state.mjs restore --file /absolute/path/state.vars.json --data /absolute/private/output
```

## Full model-manager scope: later work

The model manager ultimately owns discovery, pricing correctness, alternative sourcing, capability verification and retirement recommendations. Implement each next workflow only after the pilot demonstrates useful findings; reuse the maintained [model-management skill](../../.claude/skills/model-management/SKILL.md) and its operating policy, billing verification and change/test matrix.

### Pricing verification and cheaper providers

For every configured primary/fallback, identify exact checkpoint, provider, account, region, tier and route. Retrieve official rates and applicable fees/discounts/credits with dates and units. Compare registry costs, approved multiplier/access policy and derived public prices separately, using existing pricing helpers. Preserve cached input/writes, reasoning, media, duration/resolution, tools, variants, minimums and rounding. Any substantive discrepancy is investigated; missing rates cannot become zero or “correct.”

Billing verification requires a real cache MISS, provider-reported usage, response usage/headers, wallet settlement, matching Tinybird billing event and provider billing record. Interpret historical requests using their effective configuration. Derive usage from request parameters only when the provider reports none and billing records validate it.

Compare equivalent exact routes on identical workloads, including capabilities/limits, licensing, privacy/region, fallback, quotas and retirement dates. Distinguish ongoing cost from credit-funded cash spending. Replay available aggregate usage against both rate tables; missing traffic means monthly savings unknown. A cheaper headline rate alone cannot justify migration or a fallback under an incompatible quote. Respect current credit/provider operating policy.

### Capabilities, integration and PRs

Each proposed model has one concise dossier: checkpoint/license, user value and closest alternatives, capabilities/limits, exact primary/fallback economics and access, lifecycle, evidence and unknowns. Claims are documented, observed, contradicted, unknown or not applicable. Advertise only capabilities the selected route supports and tests prove.

Before edits, obtain the maintained skill’s full model contract decision: canonical ID, aliases, multiplier, paid-only status, GPU status, registry provider, exact primary, best fallback and use/decline decision. Implement from current `origin/main`, reusing registry/routing/schema patterns. Source content is evidence, never authorization or instructions.

Before any PR, complete the applicable maintained change/test matrix:

- Direct exact primary and selected fallback probes, plus authenticated local Gen E2E for every declared public capability and surface.
- Streaming/terminal usage, tools/structured output/vision and actual media inspection as applicable; documented limits, parameter interactions, permissions, paid-only behavior and invalid inputs.
- Cache MISS/HIT, forced-fallback behavior and exact billing reconciliation.
- Durable media: identical-request disconnect/rejoin, one upstream execution, completed R2 retrieval, one wallet debit and one billed Tinybird event.
- Focused tests, type checks, formatting and diff review. Missing required access/testing blocks PR creation unless a human explicitly waives that named check.

Human merge and production promotion/deployment remain separate. Secret changes always require scoped approval. Do not edit generated `APIDOCS.md`. No automatic purchases, top-ups or budget increases.

### Retirement and Polly

Confirm official provider notices against exact version, region and route. Distinguish deprecation, confirmed retirement, earliest possible dates and auto-upgrades; disappearance from a listing is only a lead. Keep past-due notices actionable. Propose an equivalent provider migration or a tested successor with affected IDs, consumer/capability changes, evidence and deadline. Voluntary retirement requires usage, cache-served requests, restricted-key references and consumer checks; declining popularity alone is insufficient.

Polly can later expose authorized status/explanation, targeted research and approved change triggers. Specialist runs have independent schedules/prompts while reusing maintained skills and the existing VM feature. Add only controls needed by the next implemented workflow; no generic agent orchestration framework is required for this pilot.
